from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from .bibliography import normalize_doi
from .io import BookError, load_json, save_json, slugify, utc_now, write_jsonl
from .project import (
    PHASES,
    approval_mode,
    approval_status,
    artifact_readiness,
    load_chapter,
)

USER_AGENT = "JakkritAcademicBookStudio/0.1 (scholarly research; contact via local configuration)"
JsonFetcher = Callable[[str, dict[str, str]], dict[str, Any]]


def _fetch_json(url: str, headers: dict[str, str]) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read(1000).decode("utf-8", errors="replace")
        raise BookError(f"Research API returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise BookError(f"Research API request failed: {exc.reason}") from exc


def _source_id(
    doi: str | None, provider: str, provider_id: str | None, title: str
) -> str:
    if doi:
        return "doi-" + slugify(doi, "unknown-doi")
    if provider_id:
        return f"{slugify(provider)}-{slugify(provider_id)}"
    return "title-" + slugify(title)


def _year(value: Any) -> int | None:
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _record(
    *,
    provider: str,
    provider_id: str | None,
    title: str,
    authors: list[str],
    year: int | None,
    doi: str | None,
    abstract: str | None,
    url: str | None,
    pdf_url: str | None,
    venue: str | None,
    citation_count: int | None,
    source_type: str | None,
    peer_reviewed: bool | None,
    is_retracted: bool | None,
) -> dict[str, Any]:
    normalized_doi = normalize_doi(doi or "") or None
    title = re.sub(r"\s+", " ", title or "").strip()
    return {
        "source_id": _source_id(normalized_doi, provider, provider_id, title),
        "title": title,
        "authors": [
            re.sub(r"\s+", " ", author).strip() for author in authors if author.strip()
        ],
        "year": year,
        "venue": venue,
        "doi": normalized_doi,
        "abstract": abstract,
        "url": url,
        "pdf_url": pdf_url,
        "citation_count": citation_count,
        "source_type": source_type,
        "peer_reviewed": peer_reviewed,
        "is_retracted": is_retracted,
        "providers": [provider],
        "provider_ids": {provider: provider_id} if provider_id else {},
        "evidence_level": "abstract" if abstract else "metadata-only",
        "retrieved_at": utc_now(),
    }


def _openalex(
    query: str, limit: int, year_min: int | None, fetcher: JsonFetcher
) -> list[dict[str, Any]]:
    params: dict[str, str] = {"search": query, "per-page": str(min(limit, 200))}
    if year_min:
        params["filter"] = f"from_publication_date:{year_min}-01-01"
    email = os.getenv("OPENALEX_EMAIL")
    if email:
        params["mailto"] = email
    key = os.getenv("OPENALEX_KEY")
    if key:
        params["api_key"] = key
    payload = fetcher(
        "https://api.openalex.org/works?" + urllib.parse.urlencode(params), {}
    )
    records: list[dict[str, Any]] = []
    for work in payload.get("results", []):
        abstract_index = work.get("abstract_inverted_index") or {}
        abstract_words: list[tuple[int, str]] = []
        for word, positions in abstract_index.items():
            abstract_words.extend((int(position), word) for position in positions)
        abstract = " ".join(word for _, word in sorted(abstract_words)) or None
        location = work.get("primary_location") or {}
        source = location.get("source") or {}
        best_oa = work.get("best_oa_location") or {}
        records.append(
            _record(
                provider="openalex",
                provider_id=str(work.get("id") or "").rsplit("/", 1)[-1] or None,
                title=work.get("title") or work.get("display_name") or "",
                authors=[
                    authorship.get("author", {}).get("display_name", "")
                    for authorship in work.get("authorships", [])
                ],
                year=_year(work.get("publication_year")),
                doi=work.get("doi"),
                abstract=abstract,
                url=location.get("landing_page_url") or work.get("doi"),
                pdf_url=best_oa.get("pdf_url") or location.get("pdf_url"),
                venue=source.get("display_name"),
                citation_count=_year(work.get("cited_by_count")),
                source_type=work.get("type"),
                peer_reviewed=None,
                is_retracted=work.get("is_retracted"),
            )
        )
    return records


def _crossref(
    query: str, limit: int, year_min: int | None, fetcher: JsonFetcher
) -> list[dict[str, Any]]:
    params = {"query.bibliographic": query, "rows": str(min(limit, 1000))}
    if year_min:
        params["filter"] = f"from-pub-date:{year_min}-01-01"
    headers: dict[str, str] = {}
    email = os.getenv("CROSSREF_EMAIL")
    if email:
        headers["User-Agent"] = f"{USER_AGENT} (mailto:{email})"
    payload = fetcher(
        "https://api.crossref.org/works?" + urllib.parse.urlencode(params), headers
    )
    records: list[dict[str, Any]] = []
    for item in payload.get("message", {}).get("items", []):
        date_parts = (
            item.get("published-print")
            or item.get("published-online")
            or item.get("issued")
            or {}
        ).get("date-parts", [[]])
        authors = [
            " ".join(filter(None, (author.get("given"), author.get("family"))))
            for author in item.get("author", [])
        ]
        title = " ".join(item.get("title") or [])
        container = " ".join(item.get("container-title") or []) or None
        records.append(
            _record(
                provider="crossref",
                provider_id=item.get("DOI"),
                title=title,
                authors=authors,
                year=_year(date_parts[0][0] if date_parts and date_parts[0] else None),
                doi=item.get("DOI"),
                abstract=re.sub(r"<[^>]+>", " ", item.get("abstract") or "").strip()
                or None,
                url=item.get("URL"),
                pdf_url=None,
                venue=container,
                citation_count=_year(item.get("is-referenced-by-count")),
                source_type=item.get("type"),
                peer_reviewed=None,
                is_retracted=None,
            )
        )
    return records


def _semantic_scholar(
    query: str, limit: int, year_min: int | None, fetcher: JsonFetcher
) -> list[dict[str, Any]]:
    params = {
        "query": query,
        "limit": str(min(limit, 100)),
        "fields": "paperId,title,authors,year,venue,abstract,url,openAccessPdf,citationCount,publicationTypes,externalIds",
    }
    if year_min:
        params["year"] = f"{year_min}-{datetime.now(UTC).year}"
    headers = {}
    if key := os.getenv("SEMANTIC_SCHOLAR_API_KEY"):
        headers["x-api-key"] = key
    payload = fetcher(
        "https://api.semanticscholar.org/graph/v1/paper/search?"
        + urllib.parse.urlencode(params),
        headers,
    )
    records: list[dict[str, Any]] = []
    for paper in payload.get("data", []):
        external = paper.get("externalIds") or {}
        pdf = paper.get("openAccessPdf") or {}
        publication_types = paper.get("publicationTypes") or []
        records.append(
            _record(
                provider="semantic-scholar",
                provider_id=paper.get("paperId"),
                title=paper.get("title") or "",
                authors=[author.get("name", "") for author in paper.get("authors", [])],
                year=_year(paper.get("year")),
                doi=external.get("DOI"),
                abstract=paper.get("abstract"),
                url=paper.get("url"),
                pdf_url=pdf.get("url"),
                venue=paper.get("venue"),
                citation_count=_year(paper.get("citationCount")),
                source_type=publication_types[0] if publication_types else None,
                peer_reviewed=None,
                is_retracted=None,
            )
        )
    return records


def _findpapers(query: str, limit: int, year_min: int | None) -> list[dict[str, Any]]:
    try:
        import findpapers  # type: ignore[import-not-found]
    except ImportError as exc:
        raise BookError(
            "Findpapers adapter is not installed; install the `findpapers` optional extra"
        ) from exc
    engine = findpapers.Engine()
    since = date(year_min, 1, 1) if year_min else None
    kwargs = {"since": since} if since else {}
    result = engine.search(query, **kwargs)
    records: list[dict[str, Any]] = []
    for paper in list(result.papers)[:limit]:
        value = paper.to_dict() if hasattr(paper, "to_dict") else vars(paper)
        source = value.get("source") or {}
        authors = [
            author.get("name", "") if isinstance(author, dict) else str(author)
            for author in value.get("authors", [])
        ]
        publication_date = value.get("publication_date")
        year = _year(str(publication_date)[:4]) if publication_date else None
        records.append(
            _record(
                provider="findpapers",
                provider_id=value.get("doi") or value.get("url"),
                title=value.get("title") or "",
                authors=authors,
                year=year,
                doi=value.get("doi"),
                abstract=value.get("abstract"),
                url=value.get("url"),
                pdf_url=value.get("pdf_url"),
                venue=source.get("title") if isinstance(source, dict) else None,
                citation_count=_year(value.get("citations")),
                source_type=value.get("paper_type"),
                peer_reviewed=None,
                is_retracted=value.get("is_retracted"),
            )
        )
    return records


def _dedupe_key(record: dict[str, Any]) -> str:
    if record.get("doi"):
        return "doi:" + record["doi"]
    normalized = re.sub(r"[^a-z0-9]+", "", str(record.get("title") or "").lower())
    return f"title:{normalized}:{record.get('year') or ''}"


def deduplicate(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for record in records:
        key = _dedupe_key(record)
        if key not in merged:
            merged[key] = record
            continue
        current = merged[key]
        current["providers"] = sorted(
            set(current.get("providers", [])) | set(record.get("providers", []))
        )
        current["provider_ids"] = {
            **record.get("provider_ids", {}),
            **current.get("provider_ids", {}),
        }
        for field in (
            "title",
            "authors",
            "year",
            "venue",
            "doi",
            "abstract",
            "url",
            "pdf_url",
            "citation_count",
            "source_type",
            "peer_reviewed",
            "is_retracted",
        ):
            if current.get(field) in (None, "", []):
                current[field] = record.get(field)
        if record.get("citation_count") is not None:
            current["citation_count"] = max(
                current.get("citation_count") or 0, record["citation_count"]
            )
        if current.get("abstract"):
            current["evidence_level"] = "abstract"
    return sorted(
        merged.values(),
        key=lambda item: (
            -(item.get("citation_count") or 0),
            -(item.get("year") or 0),
            item.get("title") or "",
        ),
    )


def search(
    root: Path,
    chapter: str,
    query: str,
    providers: list[str],
    limit: int = 25,
    year_min: int | None = None,
    fetcher: JsonFetcher = _fetch_json,
) -> dict[str, Any]:
    book = load_json(root / "BOOK_STATE.yaml")
    privacy_mode = book.get("privacy_mode")
    if privacy_mode == "local-only":
        raise BookError(
            "External scholarly search is blocked by privacy_mode=local-only"
        )
    if privacy_mode not in {"approved-apis", "cloud-processing-allowed"}:
        raise BookError(f"Invalid or unsupported privacy mode: {privacy_mode}")
    _, chapter_state = load_chapter(root, chapter)
    chapter_phase = chapter_state.get("phase")
    if chapter_phase not in PHASES or PHASES.index(chapter_phase) < PHASES.index(
        "source-selection"
    ):
        raise BookError(
            "Scholarly search requires the chapter to reach source-selection"
        )
    mode = approval_mode(root)
    plan_approval = approval_status(root, chapter, "research-plan")
    if mode == "minimal":
        mandate = approval_status(root, chapter, "brief")
        if mandate.get("status") != "approved":
            raise BookError(
                f"Chapter brief mandate is not currently approved: {mandate.get('status')}"
            )
        plan_readiness = artifact_readiness(root, chapter, "research-plan")
        if plan_readiness.get("status") != "ready":
            raise BookError(
                f"Research plan is not ready: {plan_readiness.get('reason')}"
            )
    elif plan_approval.get("status") != "approved":
        raise BookError(
            f"Research plan is not currently approved: {plan_approval.get('status')}"
        )
    supported = {"openalex", "crossref", "semantic-scholar", "findpapers"}
    unknown = set(providers) - supported
    if unknown:
        raise BookError(f"Unknown research providers: {', '.join(sorted(unknown))}")
    records: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for provider in providers:
        try:
            if provider == "openalex":
                records.extend(_openalex(query, limit, year_min, fetcher))
            elif provider == "crossref":
                records.extend(_crossref(query, limit, year_min, fetcher))
            elif provider == "semantic-scholar":
                records.extend(_semantic_scholar(query, limit, year_min, fetcher))
            else:
                records.extend(_findpapers(query, limit, year_min))
        except Exception as exc:  # noqa: BLE001 - isolate independent provider failures.
            errors.append({"provider": provider, "error": str(exc)})
    normalized = deduplicate(records)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
    operation_id = uuid.uuid4().hex
    stem = f"{slugify(chapter)}-{timestamp}-{operation_id}-{slugify(query)[:32]}"
    output = root / "research" / "searches" / f"{stem}.jsonl"
    ledger = root / "research" / "searches" / f"{stem}.search.json"
    write_jsonl(output, normalized)
    request_record = {
        "schema_version": 1,
        "chapter": chapter,
        "query": query,
        "providers": providers,
        "limit_per_provider": limit,
        "year_min": year_min,
        "retrieved_at": utc_now(),
        "operation_id": operation_id,
        "privacy_mode": privacy_mode,
        "approval_mode": mode,
        "research_plan_approval_revision": (
            plan_approval["record"].get("revision")
            if plan_approval.get("status") == "approved"
            else None
        ),
        "research_plan_sha256": (
            plan_readiness.get("sha256")
            if mode == "minimal"
            else plan_approval["record"].get("sha256")
        ),
        "raw_records": len(records),
        "deduplicated_records": len(normalized),
        "errors": errors,
        "results": str(output.relative_to(root)),
    }
    save_json(ledger, request_record)
    if not normalized and errors and len(errors) == len(providers):
        raise BookError(
            "All research providers failed: "
            + "; ".join(f"{e['provider']}: {e['error']}" for e in errors)
        )
    return {
        **request_record,
        "result_path": str(output),
        "ledger_path": str(ledger),
        "records": normalized,
    }


def adapter_status() -> dict[str, Any]:
    import importlib.metadata
    import importlib.util
    import shutil

    findpapers_available = importlib.util.find_spec("findpapers") is not None
    try:
        findpapers_version = (
            importlib.metadata.version("findpapers") if findpapers_available else None
        )
    except importlib.metadata.PackageNotFoundError:
        findpapers_version = None
    return {
        "openalex": {"available": True, "credentials": bool(os.getenv("OPENALEX_KEY"))},
        "crossref": {
            "available": True,
            "credentials": bool(os.getenv("CROSSREF_EMAIL")),
        },
        "semantic_scholar": {
            "available": True,
            "credentials": bool(os.getenv("SEMANTIC_SCHOLAR_API_KEY")),
        },
        "findpapers": {
            "available": findpapers_available,
            "installed_version": findpapers_version,
            "provenance": "See the pinned optional dependency in academic-book-core/pyproject.toml",
        },
        "paperqa": {"available": importlib.util.find_spec("paperqa") is not None},
        "ref_verify": {"available": shutil.which("ref-verify") is not None},
        "pandoc": {"available": shutil.which("pandoc") is not None},
    }
