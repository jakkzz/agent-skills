from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .bibliography import validate_bibliography
from .claims import add_claim, review_claim, validate_claims
from .consistency import check_consistency
from .evidence import add_evidence, evidence_search, validate_evidence
from .exporter import export_book
from .io import BookError, find_book_root, save_json
from .project import (
    PHASES,
    approve,
    create_chapter,
    init_project,
    reopen,
    status,
    transition,
    validate_project,
)
from .search import adapter_status, search
from .sources import import_source
from .verify import verify_doi


def _csv(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def _root(args: argparse.Namespace, allow_new: bool = False) -> Path:
    if args.root:
        candidate = Path(args.root).expanduser().resolve()
        return candidate if allow_new else find_book_root(candidate)
    return Path.cwd().resolve() if allow_new else find_book_root(Path.cwd())


def _comprehensive_validate(root: Path, readiness: bool = True) -> dict[str, Any]:
    project = validate_project(root, require_final=readiness)
    bibliography = validate_bibliography(root / "bibliography" / "library.bib")
    evidence = validate_evidence(root)
    claims = validate_claims(root)
    consistency = check_consistency(root)
    bibliography_blocking = bibliography["issues"] if readiness else 0
    blocking = (
        project["blocking"]
        + bibliography_blocking
        + evidence["blocking"]
        + claims["blocking"]
        + consistency["blocking"]
    )
    warnings = (
        project["warnings"]
        + (0 if readiness else bibliography["issues"])
        + evidence["warnings"]
        + claims["warnings"]
        + consistency["warnings"]
    )
    return {
        "valid": blocking == 0,
        "readiness": readiness,
        "blocking": blocking,
        "warnings": warnings,
        "project": project,
        "bibliography": bibliography,
        "evidence": evidence,
        "claims": claims,
        "consistency": consistency,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bookctl", description="Academic Book Studio deterministic core"
    )
    parser.add_argument("--root", help="Book workspace or a path inside it")
    parser.add_argument(
        "--json", action="store_true", help="Emit machine-readable JSON"
    )
    parser.add_argument(
        "--fail-on-findings",
        action="store_true",
        help="Return exit 3 when a validation command reports invalid findings",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser(
        "init", help="Initialize an academic-book workspace in a new or empty directory"
    )
    init.add_argument("--title", required=True)
    init.add_argument("--field", required=True)
    init.add_argument("--audience", required=True)
    init.add_argument("--book-type", default="academic-textbook")
    init.add_argument("--citation-style", default="apa")
    init.add_argument("--chapter-title", default="Introduction")
    init.add_argument("--formats", default="markdown")
    init.add_argument(
        "--privacy-mode",
        choices=["local-only", "approved-apis", "cloud-processing-allowed"],
        default="local-only",
    )

    chapter_create = sub.add_parser("chapter-create", help="Create another chapter")
    chapter_create.add_argument("--title", required=True)
    chapter_create.add_argument("--chapter")

    status_parser = sub.add_parser("status", help="Show book and chapter state")
    status_parser.add_argument("--chapter")

    approve_parser = sub.add_parser(
        "approve", help="Record human approval of the current canonical gate artifact"
    )
    approve_parser.add_argument("--chapter", required=True)
    approve_parser.add_argument("--gate", choices=PHASES, required=True)
    approve_parser.add_argument("--approved-by", required=True)
    approve_parser.add_argument("--notes", default="")

    transition_parser = sub.add_parser(
        "transition", help="Move to the next approved chapter phase"
    )
    transition_parser.add_argument("--chapter", required=True)
    transition_parser.add_argument("--to", choices=PHASES, required=True)

    reopen_parser = sub.add_parser(
        "reopen", help="Return a chapter to an earlier phase for renewed approvals"
    )
    reopen_parser.add_argument("--chapter", required=True)
    reopen_parser.add_argument("--to", choices=PHASES, required=True)

    search_parser = sub.add_parser(
        "search", help="Search scholarly providers after research-plan approval"
    )
    search_parser.add_argument("--chapter", required=True)
    search_parser.add_argument("--query", required=True)
    search_parser.add_argument(
        "--providers", default="openalex,crossref,semantic-scholar"
    )
    search_parser.add_argument("--limit", type=int, default=25)
    search_parser.add_argument("--year-min", type=int)

    source = sub.add_parser(
        "source-import",
        help="Import a private source into the local evidence workspace",
    )
    source.add_argument("path")
    source.add_argument("--source-id")
    source.add_argument("--citation-key")

    evidence_add = sub.add_parser(
        "evidence-add", help="Add a human-reviewed, locator-bound evidence record"
    )
    evidence_add.add_argument("--source-id", required=True)
    evidence_add.add_argument("--level", required=True)
    evidence_add.add_argument("--locator", default="")
    evidence_add.add_argument("--text", required=True)
    evidence_add.add_argument("--reviewed-by", required=True)
    evidence_add.add_argument("--relation", default="supports")
    evidence_add.add_argument("--evidence-id")

    evidence_find = sub.add_parser(
        "evidence-search", help="Search structured local evidence records"
    )
    evidence_find.add_argument("--query", required=True)
    evidence_find.add_argument("--limit", type=int, default=10)
    sub.add_parser("evidence-validate", help="Validate structured evidence records")

    bib = sub.add_parser("bib-validate", help="Validate local BibTeX/BibLaTeX")
    bib.add_argument("--path", default="bibliography/library.bib")

    claim_add = sub.add_parser("claim-add", help="Register an atomic chapter claim")
    claim_add.add_argument("--chapter", required=True)
    claim_add.add_argument("--section", required=True)
    claim_add.add_argument("--claim", required=True)
    claim_add.add_argument("--type", required=True)
    claim_add.add_argument("--source-ids", default="")
    claim_add.add_argument("--evidence-ids", default="")
    claim_add.add_argument("--citation-keys", default="")
    claim_add.add_argument("--evidence-level", required=True)
    claim_add.add_argument("--locator")
    claim_add.add_argument("--claim-id")

    claim_review = sub.add_parser(
        "claim-review", help="Record a human claim-support decision"
    )
    claim_review.add_argument("--claim-id", required=True)
    claim_review.add_argument(
        "--support",
        choices=["supported", "partial", "contradicted", "disputed", "unverifiable"],
        required=True,
    )
    claim_review.add_argument("--reviewed-by", required=True)
    claim_review.add_argument("--notes", default="")
    sub.add_parser("claim-validate", help="Validate the complete claim ledger")

    doi = sub.add_parser("doi-verify", help="Verify DOI metadata conservatively")
    doi.add_argument("doi")
    doi.add_argument("--title")
    doi.add_argument("--first-author")
    doi.add_argument("--year", type=int)

    consistency = sub.add_parser(
        "consistency", help="Check final chapters for cross-book consistency"
    )
    consistency.add_argument("--write-report", action="store_true")
    validate = sub.add_parser(
        "validate", help="Run deterministic workspace or final-readiness validation"
    )
    validate.add_argument("--workspace-only", action="store_true")
    validate.add_argument("--write-report", action="store_true")
    sub.add_parser(
        "adapter-status", help="Show optional research and export adapter availability"
    )

    export = sub.add_parser(
        "export", help="Build canonical Markdown and optional derived formats"
    )
    export.add_argument(
        "--formats", help="Comma-separated formats; defaults to BOOK_STATE.yaml"
    )
    export.add_argument("--csl")
    return parser


def execute(args: argparse.Namespace) -> dict[str, Any]:
    command = args.command
    if command == "adapter-status":
        return adapter_status()
    if command == "init":
        return init_project(
            _root(args, allow_new=True),
            title=args.title,
            field=args.field,
            audience=args.audience,
            book_type=args.book_type,
            citation_style=args.citation_style,
            chapter_title=args.chapter_title,
            output_formats=_csv(args.formats),
            privacy_mode=args.privacy_mode,
        )
    root = _root(args)
    if command == "chapter-create":
        return create_chapter(root, args.title, args.chapter)
    if command == "status":
        return status(root, args.chapter)
    if command == "approve":
        return approve(root, args.chapter, args.gate, args.approved_by, args.notes)
    if command == "transition":
        return transition(root, args.chapter, args.to)
    if command == "reopen":
        return reopen(root, args.chapter, args.to)
    if command == "search":
        if not 1 <= args.limit <= 200:
            raise BookError("Search limit must be between 1 and 200 per provider")
        return search(
            root,
            args.chapter,
            args.query,
            _csv(args.providers),
            args.limit,
            args.year_min,
        )
    if command == "source-import":
        return import_source(root, Path(args.path), args.source_id, args.citation_key)
    if command == "evidence-add":
        return add_evidence(
            root,
            args.source_id,
            args.level,
            args.locator,
            args.text,
            args.reviewed_by,
            args.relation,
            args.evidence_id,
        )
    if command == "evidence-search":
        return evidence_search(root, args.query, args.limit)
    if command == "evidence-validate":
        return validate_evidence(root)
    if command == "bib-validate":
        path = Path(args.path)
        if not path.is_absolute():
            path = root / path
        return validate_bibliography(path.resolve())
    if command == "claim-add":
        return add_claim(
            root,
            args.chapter,
            args.section,
            args.claim,
            args.type,
            _csv(args.source_ids),
            _csv(args.evidence_ids),
            args.evidence_level,
            args.locator,
            _csv(args.citation_keys),
            args.claim_id,
        )
    if command == "claim-review":
        return review_claim(
            root, args.claim_id, args.support, args.reviewed_by, args.notes
        )
    if command == "claim-validate":
        return validate_claims(root)
    if command == "doi-verify":
        return verify_doi(root, args.doi, args.title, args.first_author, args.year)
    if command == "consistency":
        result = check_consistency(root)
        if args.write_report:
            save_json(root / "build" / "consistency-report.json", result)
        return result
    if command == "validate":
        result = _comprehensive_validate(root, readiness=not args.workspace_only)
        if args.write_report:
            save_json(root / "build" / "validation-report.json", result)
        return result
    if command == "export":
        return export_book(root, _csv(args.formats) if args.formats else None, args.csl)
    raise BookError(f"Unsupported command: {command}")


def _invalid_findings(command: str, result: dict[str, Any]) -> bool:
    if command in {"claim-validate", "evidence-validate", "consistency", "validate"}:
        return result.get("valid") is False
    if command == "bib-validate":
        return bool(result.get("issues"))
    return False


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = execute(args)
    except BookError as exc:
        if args.json:
            print(
                json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False),
                file=sys.stderr,
            )
        else:
            print(f"bookctl: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("bookctl: cancelled", file=sys.stderr)
        return 130
    payload = {"ok": True, "result": result}
    print(
        json.dumps(
            payload if args.json else result, ensure_ascii=False, indent=2, default=str
        )
    )
    if args.fail_on_findings and _invalid_findings(args.command, result):
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
