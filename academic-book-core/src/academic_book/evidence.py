from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .io import (
    BookError,
    load_json,
    read_jsonl,
    sha256_file,
    slugify,
    utc_now,
    write_jsonl,
)

EVIDENCE_LEVELS = {
    "metadata-only",
    "search-snippet",
    "abstract",
    "full-text",
    "figure-or-table",
    "author-expertise",
}
EVIDENCE_RELATIONS = {"supports", "contradicts", "qualifies", "contextualizes"}
EVIDENCE_RANK = {
    "metadata-only": 0,
    "search-snippet": 1,
    "abstract": 2,
    "author-expertise": 2,
    "full-text": 3,
    "figure-or-table": 4,
}


def evidence_path(root: Path, source_id: str) -> Path:
    source_id = slugify(source_id)
    metadata = root / "research" / "sources" / source_id / "metadata.yaml"
    if not metadata.is_file():
        raise BookError(f"Imported source metadata not found: {source_id}")
    return metadata.parent / "evidence.jsonl"


def add_evidence(
    root: Path,
    source_id: str,
    level: str,
    locator: str,
    text: str,
    reviewed_by: str,
    relation: str = "supports",
    evidence_id: str | None = None,
) -> dict[str, Any]:
    if level not in EVIDENCE_LEVELS:
        raise BookError(f"Unknown evidence level: {level}")
    if level in {"full-text", "figure-or-table"} and not locator.strip():
        raise BookError(
            f"{level} evidence requires an exact page/section/figure/table locator"
        )
    if relation not in EVIDENCE_RELATIONS:
        raise BookError(f"Unknown evidence relation: {relation}")
    if not reviewed_by.strip():
        raise BookError("Evidence reviewer name must not be empty")
    path = evidence_path(root, source_id)
    metadata = load_json(path.parent / "metadata.yaml")
    source_hash = str(metadata.get("content_hash") or "")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", source_hash):
        raise BookError(f"Imported source has no valid content hash: {source_id}")
    records = read_jsonl(path)
    if not evidence_id:
        evidence_id = f"{slugify(source_id)}-e{len(records) + 1:04d}"
    if any(record.get("evidence_id") == evidence_id for record in records):
        raise BookError(f"Evidence record already exists: {evidence_id}")
    record = {
        "evidence_id": evidence_id,
        "source_id": slugify(source_id),
        "source_hash": source_hash,
        "evidence_level": level,
        "locator": locator.strip() or None,
        "text": text.strip(),
        "relation": relation,
        "review_status": "human-reviewed",
        "reviewed_by": reviewed_by.strip(),
        "reviewed_at": utc_now(),
    }
    records.append(record)
    write_jsonl(path, records)
    return record


def iter_evidence_records(root: Path) -> list[dict[str, Any]]:
    source_root = root / "research" / "sources"
    if not source_root.exists():
        return []
    return [
        record
        for path in source_root.glob("*/evidence.jsonl")
        for record in read_jsonl(path)
    ]


def load_evidence_records(root: Path) -> dict[str, dict[str, Any]]:
    return {
        str(record["evidence_id"]): record
        for record in iter_evidence_records(root)
        if record.get("evidence_id")
    }


def validate_evidence(root: Path) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    seen: set[str] = set()
    source_root = root / "research" / "sources"
    metadata_files = (
        list(source_root.glob("*/metadata.yaml")) if source_root.exists() else []
    )
    for metadata_path in metadata_files:
        metadata = load_json(metadata_path)
        for field in (
            "schema_version",
            "source_id",
            "title",
            "source_type",
            "content_hash",
            "acquisition",
            "rights",
            "source_availability",
            "evidence_level",
        ):
            if field not in metadata:
                issues.append(
                    {
                        "severity": "blocking",
                        "code": "MISSING_SOURCE_METADATA_FIELD",
                        "source": metadata_path.parent.name,
                        "field": field,
                    }
                )
        if metadata.get("schema_version") != 1:
            issues.append(
                {
                    "severity": "blocking",
                    "code": "INVALID_SOURCE_SCHEMA_VERSION",
                    "source": metadata_path.parent.name,
                }
            )
        if metadata.get("source_id") != metadata_path.parent.name:
            issues.append(
                {
                    "severity": "blocking",
                    "code": "SOURCE_DIRECTORY_MISMATCH",
                    "source": metadata_path.parent.name,
                }
            )
        if metadata.get("evidence_level") != "metadata-only":
            issues.append(
                {
                    "severity": "blocking",
                    "code": "SOURCE_EVIDENCE_MUST_START_METADATA_ONLY",
                    "source": metadata_path.parent.name,
                }
            )
        if not re.fullmatch(
            r"sha256:[a-f0-9]{64}", str(metadata.get("content_hash") or "")
        ):
            issues.append(
                {
                    "severity": "blocking",
                    "code": "INVALID_SOURCE_HASH",
                    "source": metadata_path.parent.name,
                }
            )
        managed_sources = [
            path
            for path in metadata_path.parent.iterdir()
            if path.is_file()
            and (
                path.name == "source-private" or path.name.startswith("source-private.")
            )
        ]
        if len(managed_sources) != 1:
            issues.append(
                {
                    "severity": "blocking",
                    "code": "MANAGED_SOURCE_FILE_COUNT",
                    "source": metadata_path.parent.name,
                    "count": len(managed_sources),
                }
            )
        elif f"sha256:{sha256_file(managed_sources[0])}" != metadata.get(
            "content_hash"
        ):
            issues.append(
                {
                    "severity": "blocking",
                    "code": "SOURCE_HASH_MISMATCH",
                    "source": metadata_path.parent.name,
                }
            )
    all_records = iter_evidence_records(root)
    for record in all_records:
        evidence_id = str(record.get("evidence_id") or "")
        if not evidence_id:
            issues.append({"severity": "blocking", "code": "MISSING_EVIDENCE_ID"})
            continue
        if evidence_id in seen:
            issues.append(
                {
                    "severity": "blocking",
                    "code": "DUPLICATE_EVIDENCE_ID",
                    "evidence_id": evidence_id,
                }
            )
        seen.add(evidence_id)
        level = record.get("evidence_level")
        if level not in EVIDENCE_LEVELS:
            issues.append(
                {
                    "severity": "blocking",
                    "code": "INVALID_EVIDENCE_LEVEL",
                    "evidence_id": evidence_id,
                }
            )
        if (
            record.get("review_status") != "human-reviewed"
            or not str(record.get("reviewed_by") or "").strip()
            or not str(record.get("reviewed_at") or "").strip()
        ):
            issues.append(
                {
                    "severity": "blocking",
                    "code": "UNREVIEWED_EVIDENCE",
                    "evidence_id": evidence_id,
                }
            )
        if record.get("relation") not in EVIDENCE_RELATIONS:
            issues.append(
                {
                    "severity": "blocking",
                    "code": "INVALID_EVIDENCE_RELATION",
                    "evidence_id": evidence_id,
                }
            )
        if level in {"full-text", "figure-or-table"} and not record.get("locator"):
            issues.append(
                {
                    "severity": "blocking",
                    "code": "MISSING_EVIDENCE_LOCATOR",
                    "evidence_id": evidence_id,
                }
            )
        if not str(record.get("text") or "").strip():
            issues.append(
                {
                    "severity": "blocking",
                    "code": "EMPTY_EVIDENCE_TEXT",
                    "evidence_id": evidence_id,
                }
            )
        source_id = str(record.get("source_id") or "")
        metadata_path = (
            root / "research" / "sources" / slugify(source_id) / "metadata.yaml"
        )
        if not metadata_path.is_file():
            issues.append(
                {
                    "severity": "blocking",
                    "code": "UNKNOWN_EVIDENCE_SOURCE",
                    "evidence_id": evidence_id,
                }
            )
        else:
            metadata = load_json(metadata_path)
            if metadata.get("source_id") != source_id:
                issues.append(
                    {
                        "severity": "blocking",
                        "code": "SOURCE_ID_MISMATCH",
                        "evidence_id": evidence_id,
                    }
                )
            if record.get("source_hash") != metadata.get("content_hash"):
                issues.append(
                    {
                        "severity": "blocking",
                        "code": "EVIDENCE_SOURCE_HASH_STALE",
                        "evidence_id": evidence_id,
                    }
                )
    blocking = sum(issue["severity"] == "blocking" for issue in issues)
    return {
        "valid": blocking == 0,
        "sources": len(metadata_files),
        "records": len(all_records),
        "blocking": blocking,
        "warnings": 0,
        "issues": issues,
    }


def evidence_search(root: Path, query: str, limit: int = 10) -> dict[str, Any]:
    terms = [
        term.lower()
        for term in re.findall(r"[\w-]+", query, flags=re.UNICODE)
        if len(term) > 2
    ]
    matches: list[dict[str, Any]] = []
    for evidence_id, record in load_evidence_records(root).items():
        haystack = " ".join(
            str(record.get(field) or "")
            for field in ("text", "locator", "relation", "source_id")
        ).lower()
        score = sum(term in haystack for term in terms)
        if score:
            matches.append({"evidence_id": evidence_id, "score": score, **record})
    matches.sort(
        key=lambda match: (-match["score"], match["source_id"], match["evidence_id"])
    )
    return {"query": query, "matches": matches[:limit], "total_matches": len(matches)}
