from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from .bibliography import extract_citation_keys, load_bibtex
from .io import load_json

UNRESOLVED = re.compile(
    r"\[(?:AUTHOR INPUT REQUIRED|EVIDENCE GAP|PERMISSION CHECK|TODO|TBD)[^\]]*\]",
    re.IGNORECASE,
)
SCAFFOLD_STATUS = re.compile(
    r"^Status:\s*not\s+(?:started|finalized)\s*$", re.IGNORECASE | re.MULTILINE
)
CHAPTER_REF = re.compile(r"\[\[(chapter-[a-z0-9-]+)(?:#[^\]]+)?\]\]", re.IGNORECASE)


def find_unresolved_markers(text: str) -> list[re.Match[str]]:
    return [*UNRESOLVED.finditer(text), *SCAFFOLD_STATUS.finditer(text)]


def check_consistency(root: Path) -> dict[str, Any]:
    book = load_json(root / "BOOK_STATE.yaml")
    chapters = set(book.get("chapters", []))
    issues: list[dict[str, Any]] = []
    headings: dict[str, list[dict[str, Any]]] = defaultdict(list)
    citations: set[str] = set()
    for chapter in sorted(chapters):
        path = root / "chapters" / chapter / "final.md"
        if not path.exists():
            issues.append(
                {"severity": "blocking", "code": "MISSING_FINAL", "chapter": chapter}
            )
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in find_unresolved_markers(text):
            line = text.count("\n", 0, match.start()) + 1
            issues.append(
                {
                    "severity": "blocking",
                    "code": "UNRESOLVED_MARKER",
                    "chapter": chapter,
                    "line": line,
                    "text": match.group(0),
                }
            )
        for target in CHAPTER_REF.findall(text):
            if target not in chapters:
                issues.append(
                    {
                        "severity": "blocking",
                        "code": "BROKEN_CHAPTER_REFERENCE",
                        "chapter": chapter,
                        "target": target,
                    }
                )
        for number, line in enumerate(text.splitlines(), 1):
            if line.startswith("## "):
                normalized = re.sub(r"\W+", " ", line[3:].casefold()).strip()
                headings[normalized].append(
                    {"chapter": chapter, "line": number, "heading": line[3:].strip()}
                )
        citations.update(extract_citation_keys(text))
    for normalized, locations in headings.items():
        if normalized and len({item["chapter"] for item in locations}) > 1:
            issues.append(
                {
                    "severity": "warning",
                    "code": "DUPLICATE_SECTION_HEADING",
                    "locations": locations,
                }
            )
    bib_entries, bib_warnings = load_bibtex(root / "bibliography" / "library.bib")
    bib_keys = {entry.key for entry in bib_entries}
    for key in sorted(citations - bib_keys):
        issues.append(
            {"severity": "blocking", "code": "MISSING_CITATION", "citation_key": key}
        )
    for warning in bib_warnings:
        issues.append(
            {"severity": "warning", "code": "BIBLIOGRAPHY_WARNING", "detail": warning}
        )
    claims_path = root / "claims" / "claims.jsonl"
    claim_count = (
        sum(
            1
            for line in claims_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        )
        if claims_path.exists()
        else 0
    )
    blocking = sum(issue["severity"] == "blocking" for issue in issues)
    return {
        "valid": blocking == 0,
        "chapters": len(chapters),
        "citations_used": len(citations),
        "claims": claim_count,
        "blocking": blocking,
        "warnings": len(issues) - blocking,
        "issues": issues,
    }
