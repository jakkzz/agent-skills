from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from .io import atomic_write


@dataclass(frozen=True)
class BibEntry:
    entry_type: str
    key: str
    raw: str
    fields: dict[str, str]


def _field_value(raw: str, field: str) -> str | None:
    pattern = re.compile(
        rf"(?ims)^\s*{re.escape(field)}\s*=\s*(?:\{{(?P<brace>.*?)\}}|\"(?P<quote>.*?)\")\s*,?\s*$"
    )
    match = pattern.search(raw)
    if not match:
        return None
    return (match.group("brace") or match.group("quote") or "").strip()


def parse_bibtex(text: str) -> tuple[list[BibEntry], list[str]]:
    entries: list[BibEntry] = []
    warnings: list[str] = []
    position = 0
    while True:
        match = re.search(r"@([A-Za-z]+)\s*([({])", text[position:])
        if not match:
            break
        start = position + match.start()
        entry_type = match.group(1).lower()
        opener = match.group(2)
        closer = "}" if opener == "{" else ")"
        body_start = position + match.end()
        depth = 1
        quoted = False
        escaped = False
        index = body_start
        while index < len(text) and depth:
            char = text[index]
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = not quoted
            elif not quoted:
                if char == opener:
                    depth += 1
                elif char == closer:
                    depth -= 1
            index += 1
        if depth:
            warnings.append(
                f"Unterminated @{entry_type} entry beginning at character {start}"
            )
            break
        raw = text[start:index]
        position = index
        if entry_type in {"comment", "preamble", "string"}:
            continue
        inside = text[body_start : index - 1]
        comma = inside.find(",")
        if comma < 0:
            warnings.append(f"Entry at character {start} has no citation key separator")
            continue
        key = inside[:comma].strip()
        if not key:
            warnings.append(f"Entry at character {start} has an empty citation key")
            continue
        fields = {
            field: value
            for field in (
                "title",
                "author",
                "year",
                "doi",
                "url",
                "journal",
                "booktitle",
            )
            if (value := _field_value(raw, field)) is not None
        }
        entries.append(BibEntry(entry_type=entry_type, key=key, raw=raw, fields=fields))
    return entries, warnings


def load_bibtex(path: Path) -> tuple[list[BibEntry], list[str]]:
    if not path.exists():
        return [], [f"Bibliography does not exist: {path}"]
    return parse_bibtex(path.read_text(encoding="utf-8"))


def validate_bibliography(path: Path) -> dict:
    entries, warnings = load_bibtex(path)
    seen: dict[str, int] = {}
    duplicate_dois: dict[str, list[str]] = {}
    missing: list[dict[str, str]] = []
    doi_to_keys: dict[str, list[str]] = {}
    for entry in entries:
        seen[entry.key] = seen.get(entry.key, 0) + 1
        doi = normalize_doi(entry.fields.get("doi", ""))
        if doi:
            doi_to_keys.setdefault(doi, []).append(entry.key)
        required = [
            field
            for field in ("title", "author", "year")
            if not entry.fields.get(field)
        ]
        if required:
            missing.append({"key": entry.key, "fields": ",".join(required)})
    duplicates = sorted(key for key, count in seen.items() if count > 1)
    for doi, keys in doi_to_keys.items():
        if len(keys) > 1:
            duplicate_dois[doi] = keys
    issues = len(warnings) + len(duplicates) + len(duplicate_dois) + len(missing)
    return {
        "path": str(path),
        "entries": len(entries),
        "issues": issues,
        "warnings": warnings,
        "duplicate_keys": duplicates,
        "duplicate_dois": duplicate_dois,
        "missing_required_fields": missing,
        "keys": sorted(seen),
    }


def normalize_doi(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", value)
    value = re.sub(r"^doi:\s*", "", value)
    return value.rstrip(".,; ")


def _strip_fenced_code_blocks(text: str) -> str:
    output: list[str] = []
    fence_character: str | None = None
    fence_length = 0
    for line in text.splitlines(keepends=True):
        if fence_character is None:
            opening = re.match(r" {0,3}(`{3,}|~{3,})", line)
            if opening:
                fence = opening.group(1)
                fence_character = fence[0]
                fence_length = len(fence)
                continue
            output.append(line)
            continue
        if re.match(
            rf" {{0,3}}{re.escape(fence_character)}{{{fence_length},}}\s*$", line
        ):
            fence_character = None
            fence_length = 0
    return "".join(output)


def _strip_backtick_code_spans(text: str) -> str:
    output: list[str] = []
    position = 0
    delimiter = re.compile(r"(?<!`)`+(?!`)")
    while opening := delimiter.search(text, position):
        ticks = opening.group(0)
        closing = next(
            (
                candidate
                for candidate in delimiter.finditer(text, opening.end())
                if candidate.group(0) == ticks
            ),
            None,
        )
        if closing is None:
            break
        output.append(text[position : opening.start()])
        position = closing.end()
    output.append(text[position:])
    return "".join(output)


def extract_citation_keys(markdown: str) -> set[str]:
    """Extract parenthetical and textual Pandoc citations outside code spans."""
    without_fences = _strip_fenced_code_blocks(markdown)
    without_code = _strip_backtick_code_spans(without_fences)
    # Pandoc keys may contain letters, digits, `_`, `:`, `.`, `#`, `$`, `%`, `&`,
    # `-`, `+`, `?`, `<`, `>`, `~`, and `/`. Stop at prose punctuation.
    pattern = re.compile(r"(?<![\\\w@])@([A-Za-z0-9_][A-Za-z0-9_:.#$%&+?<>~/-]*)")
    terminal_punctuation = ".,;:!?#$%&-+<>~/"
    return {
        cleaned
        for key in pattern.findall(without_code)
        if (cleaned := key.rstrip(terminal_punctuation))
    }


def write_filtered_bibliography(
    source: Path, destination: Path, keys: Iterable[str]
) -> dict:
    requested = set(keys)
    entries, warnings = load_bibtex(source)
    selected = [entry for entry in entries if entry.key in requested]
    found = {entry.key for entry in selected}
    content = "\n\n".join(entry.raw.strip() for entry in selected)
    if content:
        content += "\n"
    atomic_write(destination, content)
    return {
        "written": len(selected),
        "missing": sorted(requested - found),
        "warnings": warnings,
        "path": str(destination),
    }
