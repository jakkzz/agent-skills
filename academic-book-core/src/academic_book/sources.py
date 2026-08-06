from __future__ import annotations

import shutil
from pathlib import Path

from .io import (
    BookError,
    atomic_write,
    load_json,
    save_json,
    sha256_file,
    slugify,
    utc_now,
)


def import_source(
    root: Path,
    source_path: Path,
    source_id: str | None = None,
    citation_key: str | None = None,
) -> dict:
    source_path = source_path.expanduser().resolve()
    if not source_path.is_file():
        raise BookError(f"Source file not found: {source_path}")
    digest = sha256_file(source_path)
    source_id = slugify(source_id or source_path.stem, fallback=f"source-{digest[:12]}")
    destination_dir = root / "research" / "sources" / source_id
    metadata_path = destination_dir / "metadata.yaml"
    if metadata_path.exists():
        existing = load_json(metadata_path)
        if existing.get("content_hash") == f"sha256:{digest}":
            return {"status": "already-imported", "metadata": existing}
        raise BookError(f"Source ID already exists with different content: {source_id}")
    destination_dir.mkdir(parents=True)
    destination = destination_dir / f"source-private{source_path.suffix.lower()}"
    shutil.copy2(source_path, destination)
    metadata = {
        "schema_version": 1,
        "source_id": source_id,
        "citation_key": citation_key,
        "title": source_path.stem,
        "source_type": source_path.suffix.lower().lstrip("."),
        "content_hash": f"sha256:{digest}",
        "acquisition": {"method": "author-provided", "date": utc_now()},
        "rights": {
            "full_text_private": True,
            "quotation_permission": "review-required",
        },
        "source_availability": "full-text-local-unreviewed",
        "evidence_level": "metadata-only",
    }
    save_json(metadata_path, metadata)
    atomic_write(
        destination_dir / "evidence.md",
        f"# {source_path.stem} — Evidence\n\n"
        "Full text imported locally. No evidence is claim-usable until a human-reviewed "
        "record is added to `evidence.jsonl`.\n",
    )
    atomic_write(destination_dir / "evidence.jsonl", "")
    return {
        "status": "imported",
        "source_id": source_id,
        "metadata": metadata,
        "stored_as": str(destination),
    }
