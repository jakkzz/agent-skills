from __future__ import annotations

import json
import shutil
import subprocess
import urllib.parse
from pathlib import Path
from typing import Any

from .bibliography import normalize_doi
from .io import BookError, save_json, slugify, utc_now
from .search import _fetch_json


def verify_doi(
    root: Path,
    doi: str,
    title: str | None = None,
    first_author: str | None = None,
    year: int | None = None,
) -> dict[str, Any]:
    doi = normalize_doi(doi)
    if not doi or "/" not in doi:
        raise BookError(f"Invalid DOI: {doi}")
    method = "crossref"
    if executable := shutil.which("ref-verify"):
        args = [executable, "verify-doi", doi, "--json"]
        if title:
            args.extend(["--title", title])
        if first_author:
            args.extend(["--first-author", first_author])
        if year:
            args.extend(["--year", str(year)])
        completed = subprocess.run(
            args, capture_output=True, text=True, timeout=45, check=False
        )
        try:
            result = json.loads(completed.stdout)
        except json.JSONDecodeError:
            result = {
                "verdict": "WARN" if completed.returncode else "PASS",
                "stdout": completed.stdout.strip(),
                "stderr": completed.stderr.strip(),
            }
        method = "ref-verify"
    else:
        payload = _fetch_json(
            "https://api.crossref.org/works/" + urllib.parse.quote(doi, safe=""), {}
        )
        item = payload.get("message", {})
        date_parts = (
            item.get("published-print")
            or item.get("published-online")
            or item.get("issued")
            or {}
        ).get("date-parts", [[]])
        actual_year = date_parts[0][0] if date_parts and date_parts[0] else None
        actual_title = " ".join(item.get("title") or [])
        authors = item.get("author") or []
        actual_author = authors[0].get("family") if authors else None
        mismatches = []
        if title and title.casefold().strip() != actual_title.casefold().strip():
            mismatches.append("title")
        if first_author and (actual_author or "").casefold() != first_author.casefold():
            mismatches.append("first_author")
        if year and actual_year != year:
            mismatches.append("year")
        result = {
            "verdict": "PASS" if not mismatches else "WARN",
            "doi": normalize_doi(item.get("DOI") or doi),
            "title": actual_title,
            "first_author": actual_author,
            "year": actual_year,
            "mismatches": mismatches,
            "scope": "metadata-only; does not prove claim support",
        }
    output = root / "research" / "verifications" / f"doi-{slugify(doi)}.json"
    record = {
        "schema_version": 1,
        "method": method,
        "verified_at": utc_now(),
        "result": result,
    }
    save_json(output, record)
    return {**record, "path": str(output)}
