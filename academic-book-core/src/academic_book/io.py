from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from collections import deque
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class BookError(RuntimeError):
    """A user-actionable Academic Book Studio error."""


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str, fallback: str = "item") -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value[:80] or fallback


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise BookError(f"Required file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise BookError(
            f"{path} must contain JSON-compatible YAML; parse error at line {exc.lineno}: {exc.msg}"
        ) from exc


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def save_json(path: Path, value: Any) -> None:
    atomic_write(
        path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    )


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise BookError(f"Invalid JSONL in {path}:{number}: {exc.msg}") from exc
        if not isinstance(value, dict):
            raise BookError(f"Expected an object in {path}:{number}")
        records.append(value)
    return records


def write_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> None:
    atomic_write(
        path,
        "".join(
            json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
            for record in records
        ),
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


_DESCENDANT_SEARCH_MAX_DEPTH = 6
_DESCENDANT_SEARCH_MAX_DIRECTORIES = 5_000
_DESCENDANT_SEARCH_SKIP = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
}


def _descendant_search_base(current: Path) -> Path:
    """Search the nearest repository when a command starts above a nested book."""
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return candidate
    return current


def _descendant_book_roots(base: Path) -> list[Path]:
    queue: deque[tuple[Path, int]] = deque([(base, 0)])
    found: list[Path] = []
    visited = 0

    while queue:
        directory, depth = queue.popleft()
        visited += 1
        if visited > _DESCENDANT_SEARCH_MAX_DIRECTORIES:
            raise BookError(
                f"Book discovery below {base} examined more than "
                f"{_DESCENDANT_SEARCH_MAX_DIRECTORIES} directories; pass --root "
                "with the exact academic-book workspace"
            )

        if (directory / "BOOK_STATE.yaml").is_file():
            found.append(directory)
            continue
        if depth >= _DESCENDANT_SEARCH_MAX_DEPTH:
            continue

        try:
            children = sorted(directory.iterdir(), key=lambda path: path.name)
        except OSError:
            continue
        for child in children:
            if child.name in _DESCENDANT_SEARCH_SKIP or child.name.startswith("."):
                continue
            if child.is_symlink():
                continue
            try:
                is_directory = child.is_dir()
            except OSError:
                continue
            if is_directory:
                queue.append((child, depth + 1))

    return found


def find_book_root(start: str | Path) -> Path:
    current = Path(start).expanduser().resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / "BOOK_STATE.yaml").is_file():
            return candidate

    search_base = _descendant_search_base(current)
    descendants = _descendant_book_roots(search_base)
    if len(descendants) == 1:
        return descendants[0]
    if len(descendants) > 1:
        choices = ", ".join(str(path) for path in descendants)
        raise BookError(
            f"Multiple BOOK_STATE.yaml files found below {search_base}; pass --root "
            f"with one exact academic-book workspace: {choices}"
        )
    raise BookError(
        f"No BOOK_STATE.yaml found from {current}, its parents, or a unique "
        f"descendant within {_DESCENDANT_SEARCH_MAX_DEPTH} levels of {search_base}"
    )


def safe_relative(root: Path, value: str | Path) -> Path:
    raw = str(value).removeprefix("@")
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise BookError(
            f"Path must remain inside the book workspace: {candidate}"
        ) from exc
    return candidate
