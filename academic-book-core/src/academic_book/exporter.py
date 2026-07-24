from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from .bibliography import (
    extract_citation_keys,
    load_bibtex,
    write_filtered_bibliography,
)
from .claims import validate_claims
from .consistency import check_consistency
from .evidence import validate_evidence
from .io import BookError, atomic_write, load_json, utc_now
from .project import approval_status, load_chapter, validate_project

SUPPORTED_FORMATS = {
    "markdown": "md",
    "docx": "docx",
    "pdf": "pdf",
    "epub": "epub",
    "html": "html",
}


def _assert_export_ready(root: Path, book: dict[str, Any]) -> dict[str, Any]:
    project = validate_project(root, require_final=True)
    claims = validate_claims(root)
    evidence = validate_evidence(root)
    consistency = check_consistency(root)
    blocking = (
        project["blocking"]
        + claims["blocking"]
        + evidence["blocking"]
        + consistency["blocking"]
    )
    if blocking:
        raise BookError(
            "Book is not export-ready: "
            f"project={project['blocking']}, claims={claims['blocking']}, "
            f"evidence={evidence['blocking']}, consistency={consistency['blocking']} blocking issue(s)"
        )
    for chapter in book.get("chapters", []):
        _, state = load_chapter(root, chapter)
        if state.get("phase") != "final":
            raise BookError(f"Chapter is not final: {chapter}")
        gate = approval_status(root, chapter, "final")
        if gate.get("status") != "approved":
            raise BookError(
                f"Chapter final approval is {gate.get('status')}: {chapter}"
            )
    return {
        "project": project,
        "claims": claims,
        "evidence": evidence,
        "consistency": consistency,
    }


def export_book(
    root: Path, formats: list[str] | None = None, csl: str | None = None
) -> dict[str, Any]:
    book = load_json(root / "BOOK_STATE.yaml")
    formats = formats or list(book.get("output_formats") or ["markdown"])
    unknown = set(formats) - set(SUPPORTED_FORMATS)
    if unknown:
        raise BookError(f"Unsupported export formats: {', '.join(sorted(unknown))}")
    readiness = _assert_export_ready(root, book)
    parts = [f"# {book.get('project', {}).get('title', 'Academic Book')}\n"]
    citation_keys: set[str] = set()
    for chapter in book.get("chapters", []):
        final = root / "chapters" / chapter / "final.md"
        text = final.read_text(encoding="utf-8")
        parts.append(text.strip() + "\n")
        citation_keys.update(extract_citation_keys(text))
    bib_entries, bib_warnings = load_bibtex(root / "bibliography" / "library.bib")
    bib_keys = {entry.key for entry in bib_entries}
    missing = sorted(citation_keys - bib_keys)
    if missing:
        raise BookError(
            "Cannot export; missing bibliography entries: " + ", ".join(missing)
        )
    derived = [fmt for fmt in formats if fmt != "markdown"]
    if derived and not shutil.which("pandoc"):
        raise BookError("Pandoc is required for derived DOCX/PDF/EPUB/HTML exports")
    citation_style = str(book.get("citation_style") or "pandoc-default")
    if derived and citation_style not in {"pandoc-default", "default"} and not csl:
        raise BookError(
            f"Project citation_style={citation_style!r} requires an explicit reviewed CSL file for derived exports"
        )
    csl_path: Path | None = None
    if csl:
        csl_path = Path(csl).expanduser().resolve()
        if not csl_path.is_file():
            raise BookError(f"CSL file not found: {csl_path}")
    build = root / "build"
    build.mkdir(parents=True, exist_ok=True)
    canonical = build / "book.md"
    atomic_write(canonical, "\n\n".join(parts).rstrip() + "\n")
    bib_result = write_filtered_bibliography(
        root / "bibliography" / "library.bib",
        root / "bibliography" / "cited.bib",
        citation_keys,
    )
    outputs = {"markdown": str(canonical)}
    for fmt in derived:
        destination = build / f"book.{SUPPORTED_FORMATS[fmt]}"
        args = [
            "pandoc",
            str(canonical),
            "--standalone",
            "--citeproc",
            "--bibliography",
            str(root / "bibliography" / "cited.bib"),
            "-o",
            str(destination),
        ]
        if csl_path:
            args.extend(["--csl", str(csl_path)])
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=180, check=False
        )
        if result.returncode:
            raise BookError(
                f"Pandoc {fmt} export failed: {(result.stderr or result.stdout).strip()}"
            )
        outputs[fmt] = str(destination)
    return {
        "exported_at": utc_now(),
        "outputs": outputs,
        "citation_style": citation_style,
        "citation_keys": sorted(citation_keys),
        "bibliography": {**bib_result, "warnings": bib_warnings},
        "readiness": readiness,
    }
