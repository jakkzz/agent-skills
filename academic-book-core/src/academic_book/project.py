from __future__ import annotations

import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Any

from .consistency import find_unresolved_markers
from .io import (
    BookError,
    atomic_write,
    load_json,
    safe_relative,
    save_json,
    sha256_file,
    utc_now,
)

PHASES = [
    "brief",
    "research-plan",
    "source-selection",
    "outline",
    "sample",
    "draft-v1",
    "review",
    "revision-plan",
    "draft-v2",
    "verification",
    "final",
]

ARTIFACTS = {
    "brief": "brief.md",
    "research-plan": "research-plan.md",
    "source-selection": "source-map.yaml",
    "outline": "outline.md",
    "sample": "sample.md",
    "draft-v1": "draft-v1.md",
    "review": "reviews/consolidated.md",
    "revision-plan": "revision-plan.md",
    "draft-v2": "draft-v2.md",
    "verification": "final-verification.md",
    "final": "final.md",
}
REVIEW_SUPPORTING_ARTIFACTS = [
    "reviews/factual.md",
    "reviews/subject.md",
    "reviews/structure.md",
    "reviews/pedagogy.md",
    "reviews/style.md",
    "reviews/integrity.md",
    "reviews/cross-chapter.md",
]

PRIVACY_MODES = {"local-only", "approved-apis", "cloud-processing-allowed"}
OUTPUT_FORMATS = {"markdown", "docx", "pdf", "epub", "html"}
BOOK_PHASES = {"planning", "drafting", "review", "complete"}


def _markdown(title: str, body: str) -> str:
    return f"# {title}\n\n{body.rstrip()}\n"


def chapter_dir(root: Path, chapter: str) -> Path:
    value = chapter.strip()
    if value.isdigit():
        value = f"chapter-{int(value):02d}"
    if not re.fullmatch(r"chapter-[a-z0-9-]+", value):
        raise BookError("Chapter must be a number or a name such as chapter-01")
    path = (root / "chapters" / value).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as exc:
        raise BookError(f"Chapter path escapes the workspace: {value}") from exc
    return path


def _chapter_title(number: int, title: str) -> str:
    return f"Chapter {number}: {title}"


def derive_book_phase(root: Path, chapter_names: list[str]) -> str:
    chapter_phases: list[str] = []
    for chapter in chapter_names:
        try:
            chapter_phases.append(str(load_chapter(root, chapter)[1].get("phase")))
        except BookError:
            continue
    if chapter_phases and all(phase == "final" for phase in chapter_phases):
        if all(
            approval_status(root, chapter, "final").get("status") == "approved"
            for chapter in chapter_names
        ):
            return "complete"
        return "review"
    if any(
        phase in {"review", "revision-plan", "draft-v2", "verification", "final"}
        for phase in chapter_phases
    ):
        return "review"
    if any(
        phase not in {"brief", "research-plan", "source-selection"}
        for phase in chapter_phases
    ):
        return "drafting"
    return "planning"


def _sync_book_phase(root: Path, book: dict[str, Any]) -> None:
    book["phase"] = derive_book_phase(root, list(book.get("chapters", [])))
    book["updated_at"] = utc_now()


def create_chapter(
    root: Path, title: str, chapter: str | None = None
) -> dict[str, Any]:
    book = load_json(root / "BOOK_STATE.yaml")
    if chapter is None:
        chapter = f"chapter-{len(book.get('chapters', [])) + 1:02d}"
    directory = chapter_dir(root, chapter)
    if directory.exists():
        raise BookError(f"Chapter already exists: {directory.name}")
    directory.mkdir(parents=True)
    (directory / "reviews").mkdir()
    number_match = re.search(r"(\d+)$", directory.name)
    number = (
        int(number_match.group(1))
        if number_match
        else len(book.get("chapters", [])) + 1
    )
    now = utc_now()
    state = {
        "schema_version": 1,
        "chapter": directory.name,
        "number": number,
        "title": title,
        "phase": "brief",
        "artifacts": dict(ARTIFACTS),
        "created_at": now,
        "updated_at": now,
    }
    save_json(directory / "CHAPTER_STATE.yaml", state)
    atomic_write(
        directory / "brief.md",
        _markdown(
            _chapter_title(number, title) + " — Brief",
            """## Purpose

[AUTHOR INPUT REQUIRED: What must this chapter accomplish?]

## Reader starting point

[AUTHOR INPUT REQUIRED]

## Central claim or lesson

[AUTHOR INPUT REQUIRED]

## Required topics

- [AUTHOR INPUT REQUIRED]

## Excluded or deferred topics

- [AUTHOR INPUT REQUIRED]

## Target length

[AUTHOR INPUT REQUIRED]
""",
        ),
    )
    atomic_write(
        directory / "research-plan.md",
        _markdown(f"{title} — Research Plan", "Status: not started\n"),
    )
    save_json(
        directory / "source-map.yaml",
        {"schema_version": 1, "chapter": directory.name, "sources": []},
    )
    atomic_write(
        directory / "outline.md",
        _markdown(f"{title} — Outline", "Status: not started\n"),
    )
    atomic_write(
        directory / "sample.md",
        _markdown(f"{title} — Voice Sample", "Status: not started\n"),
    )
    atomic_write(
        directory / "draft-v1.md",
        _markdown(f"{title} — Draft V1", "Status: not started\n"),
    )
    atomic_write(
        directory / "reviews/consolidated.md",
        _markdown(f"{title} — Consolidated Review", "Status: not started\n"),
    )
    for name, heading in (
        ("factual.md", "Factual and Citation Review"),
        ("subject.md", "Subject-Matter Review"),
        ("structure.md", "Structural Review"),
        ("pedagogy.md", "Pedagogical Review"),
        ("style.md", "Style and Voice Review"),
        ("integrity.md", "Academic-Integrity Review"),
        ("cross-chapter.md", "Cross-Chapter Review"),
    ):
        atomic_write(
            directory / "reviews" / name,
            _markdown(f"{title} — {heading}", "Status: not started\n"),
        )
    atomic_write(
        directory / "revision-plan.md",
        _markdown(f"{title} — Revision Plan", "Status: not started\n"),
    )
    atomic_write(
        directory / "draft-v2.md",
        _markdown(f"{title} — Draft V2", "Status: not started\n"),
    )
    atomic_write(
        directory / "final-verification.md",
        _markdown(f"{title} — Final Verification", "Status: not started\n"),
    )
    atomic_write(directory / "final.md", _markdown(title, "Status: not finalized\n"))
    chapters = list(book.get("chapters", []))
    chapters.append(directory.name)
    book["chapters"] = chapters
    if not book.get("current_chapter"):
        book["current_chapter"] = directory.name
    _sync_book_phase(root, book)
    save_json(root / "BOOK_STATE.yaml", book)
    return state


def _build_project(
    root: Path,
    *,
    title: str,
    field: str,
    audience: str,
    book_type: str,
    citation_style: str,
    chapter_title: str,
    output_formats: list[str],
    privacy_mode: str,
) -> dict[str, Any]:
    for directory in (
        "bibliography",
        "research/searches",
        "research/sources",
        "research/verifications",
        "claims",
        "chapters",
        "build",
    ):
        (root / directory).mkdir(parents=True, exist_ok=True)
    now = utc_now()
    state = {
        "schema_version": 1,
        "project": {
            "title": title,
            "field": field,
            "book_type": book_type,
            "audience": audience,
        },
        "phase": "planning",
        "current_chapter": "chapter-01",
        "chapters": [],
        "citation_style": citation_style,
        "output_formats": output_formats,
        "privacy_mode": privacy_mode,
        "created_at": now,
        "updated_at": now,
    }
    save_json(root / "BOOK_STATE.yaml", state)
    save_json(root / "approvals.yaml", {"schema_version": 1, "approvals": []})
    save_json(
        root / "glossary.yaml",
        {
            "schema_version": 1,
            "terms": [],
            "instructions": "Add preferred, forbidden, and synonymous terms.",
        },
    )
    atomic_write(
        root / "book-brief.md",
        _markdown(
            title + " — Book Brief",
            f"""## Field

{field}

## Intended readers

{audience}

## Central thesis

[AUTHOR INPUT REQUIRED]

## Reader outcomes

- [AUTHOR INPUT REQUIRED]

## Scope boundaries

[AUTHOR INPUT REQUIRED]

## Book architecture

[AUTHOR INPUT REQUIRED]
""",
        ),
    )
    atomic_write(
        root / "style-guide.md",
        _markdown(
            title + " — Style Guide",
            """## Voice

[AUTHOR INPUT REQUIRED]

## Tone and formality

[AUTHOR INPUT REQUIRED]

## Citation density

[AUTHOR INPUT REQUIRED]

## Terminology

Use `glossary.yaml` as the machine-readable terminology authority.

## Non-negotiable rules

- Never invent citations, quotations, evidence, statistics, or page numbers.
- Distinguish evidence from interpretation and author expertise.
- Preserve uncertainty and disagreement between sources.
""",
        ),
    )
    atomic_write(
        root / "bibliography/library.bib",
        "% Better BibTeX or reviewed bibliography export\n",
    )
    atomic_write(root / "bibliography/cited.bib", "")
    atomic_write(root / "claims/claims.jsonl", "")
    atomic_write(
        root / ".gitignore",
        """# Academic Book Studio private/generated material
# Source metadata, evidence, quotations, and raw/extracted files are private by default.
# Remove this rule only after a human privacy/rights review.
research/sources/
build/
.env
.env.*
*.local
""",
    )
    chapter_state = create_chapter(root, chapter_title, "chapter-01")
    return {"book": load_json(root / "BOOK_STATE.yaml"), "chapter": chapter_state}


def init_project(
    root: Path,
    title: str,
    field: str,
    audience: str,
    book_type: str = "academic-textbook",
    citation_style: str = "apa",
    chapter_title: str = "Introduction",
    output_formats: list[str] | None = None,
    privacy_mode: str = "local-only",
) -> dict[str, Any]:
    root = root.expanduser().resolve()
    formats = output_formats or ["markdown"]
    if privacy_mode not in PRIVACY_MODES:
        raise BookError(f"Unknown privacy mode: {privacy_mode}")
    unknown_formats = set(formats) - OUTPUT_FORMATS
    if unknown_formats:
        raise BookError(f"Unknown output formats: {', '.join(sorted(unknown_formats))}")
    if root.exists() and any(root.iterdir()):
        entries = ", ".join(sorted(path.name for path in list(root.iterdir())[:8]))
        raise BookError(
            f"Initialization target must be new or empty; found existing entries: {entries}"
        )
    root.parent.mkdir(parents=True, exist_ok=True)
    if root.exists():
        root.rmdir()
    staging = root.parent / f".{root.name}.academic-book-init-{uuid.uuid4().hex}"
    try:
        staging.mkdir()
        result = _build_project(
            staging,
            title=title,
            field=field,
            audience=audience,
            book_type=book_type,
            citation_style=citation_style,
            chapter_title=chapter_title,
            output_formats=formats,
            privacy_mode=privacy_mode,
        )
        os.replace(staging, root)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return {"root": str(root), **result}


def load_chapter(root: Path, chapter: str) -> tuple[Path, dict[str, Any]]:
    directory = chapter_dir(root, chapter)
    return directory, load_json(directory / "CHAPTER_STATE.yaml")


def artifact_for(root: Path, chapter: str, gate: str) -> Path:
    directory, state = load_chapter(root, chapter)
    artifacts = state.get("artifacts")
    if not isinstance(artifacts, dict) or gate not in artifacts:
        raise BookError(f"Chapter state has no canonical artifact for gate: {gate}")
    return safe_relative(directory, str(artifacts[gate]))


def supporting_artifacts(root: Path, chapter: str, gate: str) -> list[Path]:
    directory, _ = load_chapter(root, chapter)
    relatives = REVIEW_SUPPORTING_ARTIFACTS if gate == "review" else []
    return [safe_relative(directory, relative) for relative in relatives]


def _approval_records(root: Path) -> list[dict[str, Any]]:
    value = load_json(root / "approvals.yaml")
    records = value.get("approvals", [])
    return records if isinstance(records, list) else []


def _latest_record(
    records: list[dict[str, Any]], chapter: str, gate: str
) -> dict[str, Any] | None:
    matches = [
        record
        for record in records
        if record.get("chapter") == chapter and record.get("gate") == gate
    ]
    return (
        max(matches, key=lambda record: int(record.get("revision", 0)))
        if matches
        else None
    )


def _approval_signature(record: dict[str, Any]) -> str:
    return f"r{record.get('revision', 0)}:{record.get('sha256', '')}"


def approval_status(
    root: Path, chapter: str, gate: str, _stack: set[str] | None = None
) -> dict[str, Any]:
    if gate not in PHASES:
        return {"status": "invalid", "gate": gate}
    chapter_name = chapter_dir(root, chapter).name
    records = _approval_records(root)
    record = _latest_record(records, chapter_name, gate)
    if not record:
        return {"status": "missing", "chapter": chapter_name, "gate": gate}
    expected_artifact = artifact_for(root, chapter_name, gate)
    recorded_artifact = (root / str(record.get("artifact", ""))).resolve()
    if recorded_artifact != expected_artifact:
        return {"status": "stale", "reason": "noncanonical-artifact", "record": record}
    if not expected_artifact.is_file():
        return {"status": "stale", "reason": "artifact-missing", "record": record}
    actual = sha256_file(expected_artifact)
    if actual != record.get("sha256"):
        return {
            "status": "stale",
            "reason": "artifact-changed",
            "record": record,
            "actual_sha256": actual,
        }
    expected_supporting = supporting_artifacts(root, chapter_name, gate)
    recorded_supporting = record.get("supporting_artifacts", {})
    expected_relative = {str(path.relative_to(root)) for path in expected_supporting}
    if set(recorded_supporting) != expected_relative:
        return {
            "status": "stale",
            "reason": "supporting-artifact-set-changed",
            "record": record,
        }
    for supporting in expected_supporting:
        relative = str(supporting.relative_to(root))
        if not supporting.is_file() or sha256_file(
            supporting
        ) != recorded_supporting.get(relative):
            return {
                "status": "stale",
                "reason": f"supporting-artifact-changed:{relative}",
                "record": record,
            }
    stack = set(_stack or set())
    token = f"{chapter_name}:{gate}"
    if token in stack:
        return {"status": "stale", "reason": "approval-cycle", "record": record}
    stack.add(token)
    predecessors = record.get("predecessors", {})
    for predecessor in PHASES[: PHASES.index(gate)]:
        previous_status = approval_status(root, chapter_name, predecessor, stack)
        if previous_status.get("status") != "approved":
            return {
                "status": "stale",
                "reason": f"predecessor-{predecessor}-{previous_status.get('status')}",
                "record": record,
            }
        previous_record = previous_status["record"]
        if predecessors.get(predecessor) != _approval_signature(previous_record):
            return {
                "status": "stale",
                "reason": f"predecessor-{predecessor}-changed",
                "record": record,
            }
    return {"status": "approved", "record": record}


def approve(
    root: Path, chapter: str, gate: str, approved_by: str, notes: str = ""
) -> dict[str, Any]:
    directory, state = load_chapter(root, chapter)
    if gate != state.get("phase"):
        raise BookError(
            f"Only the current chapter gate may be approved; current phase is {state.get('phase')}"
        )
    target = artifact_for(root, directory.name, gate)
    if not target.is_file():
        raise BookError(f"Cannot approve missing artifact: {target}")
    unresolved = find_unresolved_markers(
        target.read_text(encoding="utf-8", errors="replace")
    )
    if unresolved:
        raise BookError(
            f"Cannot approve {gate}; canonical artifact has {len(unresolved)} unresolved marker(s)"
        )
    supporting_hashes: dict[str, str] = {}
    for supporting in supporting_artifacts(root, directory.name, gate):
        if not supporting.is_file():
            raise BookError(
                f"Cannot approve {gate}; supporting review artifact is missing: {supporting}"
            )
        supporting_unresolved = find_unresolved_markers(
            supporting.read_text(encoding="utf-8", errors="replace")
        )
        if supporting_unresolved:
            raise BookError(
                f"Cannot approve {gate}; supporting artifact {supporting.name} has unresolved markers"
            )
        supporting_hashes[str(supporting.relative_to(root))] = sha256_file(supporting)
    records = _approval_records(root)
    predecessors: dict[str, str] = {}
    for predecessor in PHASES[: PHASES.index(gate)]:
        previous_status = approval_status(root, directory.name, predecessor)
        if previous_status.get("status") != "approved":
            raise BookError(
                f"Cannot approve {gate}; predecessor {predecessor} is {previous_status.get('status')}"
            )
        predecessors[predecessor] = _approval_signature(previous_status["record"])
    revision = (
        max((int(record.get("revision", 0)) for record in records), default=0) + 1
    )
    record = {
        "chapter": directory.name,
        "gate": gate,
        "artifact": str(target.relative_to(root)),
        "sha256": sha256_file(target),
        "revision": revision,
        "predecessors": predecessors,
        "supporting_artifacts": supporting_hashes,
        "decision": "approved",
        "approved_by": approved_by,
        "approved_at": utc_now(),
        "notes": notes,
    }
    records.append(record)
    save_json(root / "approvals.yaml", {"schema_version": 1, "approvals": records})
    book = load_json(root / "BOOK_STATE.yaml")
    _sync_book_phase(root, book)
    save_json(root / "BOOK_STATE.yaml", book)
    return record


def transition(root: Path, chapter: str, next_phase: str) -> dict[str, Any]:
    directory, state = load_chapter(root, chapter)
    current = state.get("phase")
    if current not in PHASES or next_phase not in PHASES:
        raise BookError(f"Invalid phase transition: {current} -> {next_phase}")
    expected_index = PHASES.index(current) + 1
    if expected_index >= len(PHASES) or PHASES[expected_index] != next_phase:
        expected = PHASES[expected_index] if expected_index < len(PHASES) else "none"
        raise BookError(
            f"Only the next phase is allowed; expected {expected}, received {next_phase}"
        )
    gate_status = approval_status(root, directory.name, current)
    if gate_status.get("status") != "approved":
        raise BookError(
            f"Gate {current} is not currently approved: {gate_status.get('status')}"
        )
    state["phase"] = next_phase
    state["updated_at"] = utc_now()
    save_json(directory / "CHAPTER_STATE.yaml", state)
    book = load_json(root / "BOOK_STATE.yaml")
    book["current_chapter"] = directory.name
    _sync_book_phase(root, book)
    save_json(root / "BOOK_STATE.yaml", book)
    return {
        "chapter": directory.name,
        "from": current,
        "to": next_phase,
        "approval": gate_status,
    }


def reopen(root: Path, chapter: str, target_phase: str) -> dict[str, Any]:
    directory, state = load_chapter(root, chapter)
    current = state.get("phase")
    if current not in PHASES or target_phase not in PHASES:
        raise BookError(f"Invalid reopen transition: {current} -> {target_phase}")
    if PHASES.index(target_phase) >= PHASES.index(current):
        raise BookError("Reopen target must be earlier than the current phase")
    state["phase"] = target_phase
    state["updated_at"] = utc_now()
    save_json(directory / "CHAPTER_STATE.yaml", state)
    book = load_json(root / "BOOK_STATE.yaml")
    book["current_chapter"] = directory.name
    _sync_book_phase(root, book)
    save_json(root / "BOOK_STATE.yaml", book)
    return {
        "chapter": directory.name,
        "from": current,
        "to": target_phase,
        "note": "The target and all downstream gates require renewed human approval.",
    }


def status(root: Path, chapter: str | None = None) -> dict[str, Any]:
    book = load_json(root / "BOOK_STATE.yaml")
    chapter_name = chapter or book.get("current_chapter")
    if not chapter_name:
        return {"root": str(root), "book": book, "chapter": None}
    directory, chapter_state = load_chapter(root, chapter_name)
    phase = chapter_state.get("phase", "brief")
    gate = approval_status(root, directory.name, phase)
    search_files = list((root / "research/searches").glob("*.jsonl"))
    discovered = sum(
        1
        for path in search_files
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    )
    source_map = load_json(directory / "source-map.yaml")
    private_sources = list((root / "research/sources").glob("*/metadata.yaml"))
    claims_file = root / "claims/claims.jsonl"
    claims = (
        sum(
            1
            for line in claims_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        )
        if claims_file.exists()
        else 0
    )
    current_artifact = artifact_for(root, directory.name, phase)
    next_phase = (
        PHASES[PHASES.index(phase) + 1]
        if phase in PHASES and phase != PHASES[-1]
        else None
    )
    return {
        "root": str(root),
        "book_title": book.get("project", {}).get("title"),
        "book_phase": derive_book_phase(root, list(book.get("chapters", []))),
        "chapter": directory.name,
        "chapter_title": chapter_state.get("title"),
        "chapter_phase": phase,
        "next_phase": next_phase,
        "reopen_targets": PHASES[: PHASES.index(phase)] if phase in PHASES else [],
        "allowed_gates": [phase] if phase in PHASES else [],
        "current_artifact": str(current_artifact.relative_to(root)),
        "current_artifact_sha256": sha256_file(current_artifact)
        if current_artifact.is_file()
        else None,
        "current_gate": gate.get("status"),
        "current_gate_reason": gate.get("reason"),
        "sources_discovered": discovered,
        "sources_selected": len(source_map.get("sources", [])),
        "sources_ingested": len(private_sources),
        "claims": claims,
        "unresolved_markers": len(
            find_unresolved_markers(
                current_artifact.read_text(encoding="utf-8", errors="replace")
            )
        )
        if current_artifact.is_file()
        else 0,
    }


def _issue(
    issues: list[dict[str, str]],
    code: str,
    *,
    severity: str = "blocking",
    **values: str,
) -> None:
    issues.append({"severity": severity, "code": code, **values})


def validate_project(root: Path, require_final: bool = False) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    for relative in (
        "BOOK_STATE.yaml",
        "approvals.yaml",
        "book-brief.md",
        "style-guide.md",
        "glossary.yaml",
    ):
        if not (root / relative).exists():
            _issue(issues, "MISSING_FILE", path=relative)
    if issues:
        return {
            "valid": False,
            "blocking": len(issues),
            "warnings": 0,
            "issues": issues,
        }
    book = load_json(root / "BOOK_STATE.yaml")
    if book.get("schema_version") != 1:
        _issue(issues, "INVALID_SCHEMA_VERSION", path="BOOK_STATE.yaml")
    project = book.get("project")
    if not isinstance(project, dict):
        _issue(issues, "INVALID_PROJECT")
    else:
        for field in ("title", "field", "book_type", "audience"):
            if not isinstance(project.get(field), str) or not project[field].strip():
                _issue(issues, "INVALID_PROJECT_FIELD", field=field)
    if book.get("phase") not in BOOK_PHASES:
        _issue(issues, "INVALID_BOOK_PHASE", phase=str(book.get("phase")))
    if book.get("privacy_mode") not in PRIVACY_MODES:
        _issue(issues, "INVALID_PRIVACY_MODE", value=str(book.get("privacy_mode")))
    formats = book.get("output_formats")
    if not isinstance(formats, list) or not formats or set(formats) - OUTPUT_FORMATS:
        _issue(issues, "INVALID_OUTPUT_FORMATS")
    if (
        not isinstance(book.get("citation_style"), str)
        or not book["citation_style"].strip()
    ):
        _issue(issues, "INVALID_CITATION_STYLE")
    chapters = book.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        _issue(issues, "NO_CHAPTERS")
        chapters = []
    elif len(chapters) != len(set(chapters)):
        _issue(issues, "DUPLICATE_CHAPTER")
    derived_phase = derive_book_phase(root, chapters)
    if book.get("phase") != derived_phase:
        _issue(
            issues,
            "STALE_BOOK_PHASE",
            severity="warning",
            stored=str(book.get("phase")),
            derived=derived_phase,
        )
    for chapter in chapters:
        try:
            directory, state = load_chapter(root, chapter)
        except BookError as exc:
            _issue(issues, "INVALID_CHAPTER", detail=str(exc))
            continue
        if state.get("schema_version") != 1:
            _issue(issues, "INVALID_CHAPTER_SCHEMA_VERSION", chapter=chapter)
        if state.get("chapter") != chapter:
            _issue(issues, "CHAPTER_ID_MISMATCH", chapter=chapter)
        if not isinstance(state.get("number"), int) or state["number"] < 1:
            _issue(issues, "INVALID_CHAPTER_NUMBER", chapter=chapter)
        if not isinstance(state.get("title"), str) or not state["title"].strip():
            _issue(issues, "INVALID_CHAPTER_TITLE", chapter=chapter)
        phase = state.get("phase")
        if phase not in PHASES:
            _issue(issues, "INVALID_PHASE", chapter=chapter, phase=str(phase))
            continue
        artifacts = state.get("artifacts")
        if not isinstance(artifacts, dict) or set(artifacts) != set(PHASES):
            _issue(issues, "INVALID_ARTIFACT_MAP", chapter=chapter)
            continue
        for gate in PHASES:
            try:
                artifact = artifact_for(root, chapter, gate)
            except BookError as exc:
                _issue(
                    issues,
                    "INVALID_ARTIFACT",
                    chapter=chapter,
                    gate=gate,
                    detail=str(exc),
                )
                continue
            if not artifact.exists():
                _issue(
                    issues,
                    "MISSING_ARTIFACT",
                    chapter=chapter,
                    path=str(artifact.relative_to(directory)),
                )
        gate_status = approval_status(root, chapter, phase)
        if gate_status.get("status") == "stale":
            _issue(
                issues,
                "STALE_APPROVAL",
                chapter=chapter,
                gate=phase,
                reason=str(gate_status.get("reason")),
            )
        if require_final:
            if phase != "final":
                _issue(issues, "CHAPTER_NOT_FINAL", chapter=chapter, phase=phase)
            final_status = approval_status(root, chapter, "final")
            if final_status.get("status") != "approved":
                _issue(
                    issues,
                    "FINAL_NOT_APPROVED",
                    chapter=chapter,
                    status=str(final_status.get("status")),
                    reason=str(final_status.get("reason")),
                )
    blocking = sum(issue["severity"] == "blocking" for issue in issues)
    return {
        "valid": blocking == 0,
        "blocking": blocking,
        "warnings": len(issues) - blocking,
        "issues": issues,
        "chapters": len(chapters),
        "readiness": require_final,
    }
