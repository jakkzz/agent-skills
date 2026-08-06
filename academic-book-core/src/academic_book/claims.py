from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from .bibliography import load_bibtex
from .evidence import EVIDENCE_LEVELS, EVIDENCE_RANK, load_evidence_records
from .io import BookError, read_jsonl, slugify, utc_now, write_jsonl

STRONG_CLAIM_TYPES = {"empirical", "causal", "quantitative", "historical"}
SUPPORT_STATES = {
    "unreviewed",
    "supported",
    "partial",
    "contradicted",
    "disputed",
    "unverifiable",
}
REVIEW_STATES = {"pending-human-review", "human-reviewed"}


def claims_path(root: Path) -> Path:
    return root / "claims" / "claims.jsonl"


def _review_digest(record: dict[str, Any], evidence: dict[str, dict[str, Any]]) -> str:
    evidence_snapshots = [
        evidence[evidence_id]
        for evidence_id in sorted(record.get("evidence_ids") or [])
        if evidence_id in evidence
    ]
    material = {
        "claim_id": record.get("claim_id"),
        "chapter": record.get("chapter"),
        "section": record.get("section"),
        "claim": record.get("claim"),
        "claim_type": record.get("claim_type"),
        "source_ids": sorted(record.get("source_ids") or []),
        "evidence_ids": sorted(record.get("evidence_ids") or []),
        "citation_keys": sorted(record.get("citation_keys") or []),
        "evidence_level": record.get("evidence_level"),
        "evidence_locator": record.get("evidence_locator"),
        "evidence_snapshots": evidence_snapshots,
        "support": record.get("support"),
        "review_status": record.get("review_status"),
        "reviewed_by": record.get("reviewed_by"),
        "reviewed_at": record.get("reviewed_at"),
        "review_notes": record.get("review_notes"),
    }
    serialized = json.dumps(
        material, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def add_claim(
    root: Path,
    chapter: str,
    section: str,
    claim: str,
    claim_type: str,
    source_ids: list[str],
    evidence_ids: list[str],
    evidence_level: str,
    locator: str | None = None,
    citation_keys: list[str] | None = None,
    claim_id: str | None = None,
) -> dict[str, Any]:
    if evidence_level not in EVIDENCE_LEVELS:
        raise BookError(f"Unknown evidence level: {evidence_level}")
    if not (root / "chapters" / chapter / "CHAPTER_STATE.yaml").is_file():
        raise BookError(f"Unknown chapter: {chapter}")
    records = read_jsonl(claims_path(root))
    if not claim_id:
        prefix = slugify(chapter, "chapter")
        claim_id = f"{prefix}-c{len(records) + 1:04d}"
    if any(record.get("claim_id") == claim_id for record in records):
        raise BookError(f"Claim already exists: {claim_id}")
    record = {
        "claim_id": claim_id,
        "chapter": chapter,
        "section": section,
        "claim": claim.strip(),
        "claim_type": claim_type,
        "source_ids": sorted(set(source_ids)),
        "evidence_ids": sorted(set(evidence_ids)),
        "citation_keys": sorted(set(citation_keys or [])),
        "evidence_level": evidence_level,
        "evidence_locator": locator,
        "support": "unreviewed",
        "review_status": "pending-human-review",
        "created_at": utc_now(),
    }
    records.append(record)
    write_jsonl(claims_path(root), records)
    return record


def review_claim(
    root: Path, claim_id: str, support: str, reviewed_by: str, notes: str = ""
) -> dict[str, Any]:
    if support not in SUPPORT_STATES - {"unreviewed"}:
        raise BookError(f"Invalid reviewed support state: {support}")
    records = read_jsonl(claims_path(root))
    match: dict[str, Any] | None = None
    for record in records:
        if record.get("claim_id") == claim_id:
            match = record
            break
    if match is None:
        raise BookError(f"Unknown claim: {claim_id}")
    evidence = load_evidence_records(root)
    if not reviewed_by.strip():
        raise BookError("Claim reviewer name must not be empty")
    match["support"] = support
    match["review_status"] = "human-reviewed"
    match["reviewed_by"] = reviewed_by.strip()
    match["reviewed_at"] = utc_now()
    match["review_notes"] = notes.strip()
    match["review_digest"] = _review_digest(match, evidence)
    write_jsonl(claims_path(root), records)
    return match


def known_source_ids(root: Path) -> set[str]:
    source_ids: set[str] = set()
    source_root = root / "research" / "sources"
    if source_root.exists():
        for metadata in source_root.glob("*/metadata.yaml"):
            try:
                value = json.loads(metadata.read_text(encoding="utf-8"))
                if value.get("source_id"):
                    source_ids.add(str(value["source_id"]))
            except (OSError, ValueError):
                continue
    search_root = root / "research" / "searches"
    for path in search_root.glob("*.jsonl") if search_root.exists() else []:
        for record in read_jsonl(path):
            if record.get("source_id"):
                source_ids.add(str(record["source_id"]))
    return source_ids


def _add(
    issues: list[dict[str, Any]],
    claim_id: str,
    code: str,
    *,
    severity: str = "blocking",
    **values: Any,
) -> None:
    issues.append({"claim_id": claim_id, "code": code, "severity": severity, **values})


def validate_claims(root: Path) -> dict[str, Any]:
    records = read_jsonl(claims_path(root))
    sources = known_source_ids(root)
    evidence = load_evidence_records(root)
    bib_entries, bib_warnings = load_bibtex(root / "bibliography" / "library.bib")
    bib_keys = {entry.key for entry in bib_entries}
    issues: list[dict[str, Any]] = []
    ids: set[str] = set()
    normalized_claims: dict[str, str] = {}
    for index, record in enumerate(records, 1):
        claim_id = str(record.get("claim_id") or f"line-{index}")
        if claim_id in ids:
            _add(issues, claim_id, "DUPLICATE_ID")
        ids.add(claim_id)
        for field in (
            "chapter",
            "section",
            "claim",
            "claim_type",
            "source_ids",
            "evidence_ids",
            "support",
            "review_status",
        ):
            if field not in record:
                _add(issues, claim_id, "MISSING_CLAIM_FIELD", field=field)
        text = str(record.get("claim") or "").strip()
        if not text:
            _add(issues, claim_id, "EMPTY_CLAIM")
        for field in ("section", "claim_type"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                _add(issues, claim_id, "EMPTY_CLAIM_FIELD", field=field)
        if not (
            root / "chapters" / str(record.get("chapter") or "") / "CHAPTER_STATE.yaml"
        ).is_file():
            _add(issues, claim_id, "UNKNOWN_CHAPTER")
        normalized = re.sub(r"\W+", " ", text.lower()).strip()
        if normalized and normalized in normalized_claims:
            _add(
                issues,
                claim_id,
                "DUPLICATE_CLAIM",
                severity="warning",
                other=normalized_claims[normalized],
            )
        elif normalized:
            normalized_claims[normalized] = claim_id
        declared_level = record.get("evidence_level")
        if declared_level not in EVIDENCE_LEVELS:
            _add(issues, claim_id, "INVALID_EVIDENCE_LEVEL")
        source_ids = set(record.get("source_ids") or [])
        evidence_ids = set(record.get("evidence_ids") or [])
        if (
            record.get("claim_type") in STRONG_CLAIM_TYPES
            and not evidence_ids
            and declared_level != "author-expertise"
        ):
            _add(issues, claim_id, "NO_REVIEWED_EVIDENCE")
        for source_id in sorted(source_ids - sources):
            _add(issues, claim_id, "UNKNOWN_SOURCE", source_id=source_id)
        matched_evidence: list[dict[str, Any]] = []
        for evidence_id in sorted(evidence_ids):
            evidence_record = evidence.get(evidence_id)
            if not evidence_record:
                _add(issues, claim_id, "UNKNOWN_EVIDENCE", evidence_id=evidence_id)
                continue
            matched_evidence.append(evidence_record)
            if evidence_record.get("review_status") != "human-reviewed":
                _add(issues, claim_id, "UNREVIEWED_EVIDENCE", evidence_id=evidence_id)
            if evidence_record.get("source_id") not in source_ids:
                _add(
                    issues,
                    claim_id,
                    "EVIDENCE_SOURCE_MISMATCH",
                    evidence_id=evidence_id,
                )
        if matched_evidence and declared_level in EVIDENCE_RANK:
            strongest = max(
                EVIDENCE_RANK.get(str(item.get("evidence_level")), -1)
                for item in matched_evidence
            )
            if EVIDENCE_RANK[declared_level] > strongest:
                _add(
                    issues,
                    claim_id,
                    "EVIDENCE_LEVEL_INFLATION",
                    declared=declared_level,
                )
        if source_ids and declared_level != "author-expertise":
            evidenced_sources = {
                str(item.get("source_id")) for item in matched_evidence
            }
            for source_id in sorted(source_ids - evidenced_sources):
                _add(issues, claim_id, "SOURCE_WITHOUT_EVIDENCE", source_id=source_id)
        support = record.get("support")
        if support not in SUPPORT_STATES:
            _add(issues, claim_id, "INVALID_SUPPORT_STATE")
        review_status = record.get("review_status")
        if review_status not in REVIEW_STATES:
            _add(issues, claim_id, "INVALID_REVIEW_STATUS")
        elif review_status != "human-reviewed" or support == "unreviewed":
            _add(issues, claim_id, "CLAIM_PENDING_HUMAN_REVIEW")
        else:
            if (
                not str(record.get("reviewed_by") or "").strip()
                or not str(record.get("reviewed_at") or "").strip()
            ):
                _add(issues, claim_id, "INVALID_CLAIM_REVIEWER")
            if record.get("review_digest") != _review_digest(record, evidence):
                _add(issues, claim_id, "STALE_CLAIM_REVIEW")
            if support in {"contradicted", "unverifiable"}:
                _add(issues, claim_id, "NON_EXPORTABLE_CLAIM_OUTCOME", support=support)
            if (
                support in {"partial", "disputed"}
                and not str(record.get("review_notes") or "").strip()
            ):
                _add(
                    issues, claim_id, "QUALIFIED_CLAIM_REQUIRES_NOTES", support=support
                )
        for key in record.get("citation_keys") or []:
            if key not in bib_keys:
                _add(issues, claim_id, "MISSING_BIB_ENTRY", citation_key=key)
    blocking = sum(issue["severity"] == "blocking" for issue in issues)
    return {
        "claims": len(records),
        "blocking": blocking,
        "warnings": len(issues) - blocking + len(bib_warnings),
        "issues": issues,
        "bibliography_warnings": bib_warnings,
        "valid": blocking == 0,
    }
