import json
import tempfile
import unittest
from pathlib import Path

from helpers import advance_to

from academic_book.evidence import validate_evidence
from academic_book.io import BookError
from academic_book.project import (
    PHASES,
    approval_status,
    approve,
    init_project,
    reopen,
    status,
    transition,
    validate_project,
)
from academic_book.sources import import_source


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "book"
        init_project(
            self.root,
            "Test Book",
            "Education",
            "Graduate students",
            approval_mode="stage-gated",
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_init_creates_complete_workspace(self):
        state = json.loads((self.root / "BOOK_STATE.yaml").read_text())
        self.assertEqual(state["chapters"], ["chapter-01"])
        self.assertTrue(
            (self.root / "chapters/chapter-01/CHAPTER_STATE.yaml").is_file()
        )
        self.assertTrue(validate_project(self.root)["valid"])
        current = status(self.root)
        self.assertEqual(current["chapter_phase"], "brief")
        self.assertEqual(current["next_phase"], "research-plan")

    def test_init_refuses_nonempty_target_without_overwrite(self):
        target = Path(self.temp.name) / "existing"
        target.mkdir()
        original = target / ".gitignore"
        original.write_text("keep-me\n")
        with self.assertRaisesRegex(BookError, "new or empty"):
            init_project(
                target,
                "Unsafe",
                "Field",
                "Readers",
                approval_mode="stage-gated",
            )
        self.assertEqual(original.read_text(), "keep-me\n")

    def test_scaffold_artifact_cannot_be_approved(self):
        with self.assertRaisesRegex(BookError, "unresolved marker"):
            approve(self.root, "chapter-01", "brief", "Human")

    def test_transition_requires_current_approval(self):
        with self.assertRaisesRegex(BookError, "not currently approved"):
            transition(self.root, "chapter-01", "research-plan")
        (self.root / "chapters/chapter-01/brief.md").write_text("# Reviewed brief\n")
        record = approve(self.root, "chapter-01", "brief", "Human")
        self.assertEqual(record["decision"], "approved")
        result = transition(self.root, "chapter-01", "research-plan")
        self.assertEqual(result["to"], "research-plan")

    def test_cannot_approve_future_gate(self):
        with self.assertRaisesRegex(BookError, "current chapter gate"):
            approve(self.root, "chapter-01", "final", "Human")

    def test_changed_artifact_makes_approval_and_dependents_stale(self):
        advance_to(self.root, "outline")
        (self.root / "chapters/chapter-01/outline.md").write_text(
            "# Reviewed outline\n"
        )
        approve(self.root, "chapter-01", "outline", "Human")
        brief = self.root / "chapters/chapter-01/brief.md"
        brief.write_text(brief.read_text() + "\nChanged after downstream approval.\n")
        self.assertEqual(
            approval_status(self.root, "chapter-01", "brief")["status"], "stale"
        )
        outline = approval_status(self.root, "chapter-01", "outline")
        self.assertEqual(outline["status"], "stale")
        self.assertIn("predecessor-brief", outline["reason"])

    def test_review_gate_requires_all_independent_reports(self):
        advance_to(self.root, "review")
        (self.root / "chapters/chapter-01/reviews/consolidated.md").write_text(
            "# Consolidated review\n"
        )
        with self.assertRaisesRegex(BookError, "supporting artifact"):
            approve(self.root, "chapter-01", "review", "Human")
        for review in (self.root / "chapters/chapter-01/reviews").glob("*.md"):
            review.write_text(f"# Completed {review.stem} review\n")
        approve(self.root, "chapter-01", "review", "Human")
        (self.root / "chapters/chapter-01/reviews/factual.md").write_text(
            "# Changed after approval\n"
        )
        self.assertEqual(
            approval_status(self.root, "chapter-01", "review")["status"], "stale"
        )

    def test_reopen_returns_to_earlier_phase_and_requires_reapproval(self):
        advance_to(self.root, "outline")
        result = reopen(self.root, "chapter-01", "research-plan")
        self.assertEqual(result["to"], "research-plan")
        self.assertEqual(status(self.root)["chapter_phase"], "research-plan")
        approve(self.root, "chapter-01", "research-plan", "Human")

    def test_cannot_skip_a_phase(self):
        (self.root / "chapters/chapter-01/brief.md").write_text("# Reviewed brief\n")
        approve(self.root, "chapter-01", "brief", "Human")
        with self.assertRaisesRegex(BookError, "Only the next phase"):
            transition(self.root, "chapter-01", "outline")

    def test_minimal_mode_uses_brief_mandate_and_final_packet_approval(self):
        root = Path(self.temp.name) / "minimal-book"
        init_project(root, "Minimal", "Education", "Readers")
        state = json.loads((root / "BOOK_STATE.yaml").read_text())
        self.assertEqual(state["approval_mode"], "minimal")
        chapter = root / "chapters/chapter-01"
        (chapter / "brief.md").write_text("# Approved chapter mandate\n")
        approve(root, "chapter-01", "brief", "Human")
        transition(root, "chapter-01", "research-plan")

        for phase in PHASES[1:-1]:
            current = status(root)
            self.assertEqual(current["chapter_phase"], phase)
            artifact = root / current["current_artifact"]
            if phase == "source-selection":
                artifact.write_text(
                    '{"schema_version":1,"chapter":"chapter-01",'
                    '"sources":[{"source_id":"fixture"}]}\n'
                )
            else:
                artifact.write_text(f"# Completed {phase}\n")
            if phase == "review":
                for review in (chapter / "reviews").glob("*.md"):
                    review.write_text(f"# Completed {review.stem}\n")
            with self.assertRaisesRegex(BookError, "not required"):
                approve(root, "chapter-01", phase, "Human")
            transition(root, "chapter-01", current["next_phase"])

        (chapter / "final.md").write_text("# Final chapter\n")
        record = approve(root, "chapter-01", "final", "Human")
        self.assertIn("artifact_manifest", record)
        self.assertEqual(status(root)["book_phase"], "complete")

        (chapter / "outline.md").write_text("# Changed outline\n")
        final_status = approval_status(root, "chapter-01", "final")
        self.assertEqual(final_status["status"], "stale")
        self.assertIn("manifest-artifact-changed", final_status["reason"])

    def test_minimal_mode_refuses_incomplete_delegated_transition(self):
        root = Path(self.temp.name) / "minimal-incomplete"
        init_project(root, "Minimal", "Education", "Readers")
        chapter = root / "chapters/chapter-01"
        (chapter / "brief.md").write_text("# Approved chapter mandate\n")
        approve(root, "chapter-01", "brief", "Human")
        transition(root, "chapter-01", "research-plan")
        with self.assertRaisesRegex(BookError, "not ready"):
            transition(root, "chapter-01", "source-selection")

    def test_runtime_validation_enforces_version_and_privacy_contract(self):
        path = self.root / "BOOK_STATE.yaml"
        state = json.loads(path.read_text())
        state["schema_version"] = 2
        state["privacy_mode"] = "anything-goes"
        path.write_text(json.dumps(state))
        result = validate_project(self.root)
        codes = {issue["code"] for issue in result["issues"]}
        self.assertIn("INVALID_SCHEMA_VERSION", codes)
        self.assertIn("INVALID_PRIVACY_MODE", codes)

    def test_readiness_requires_final_approval(self):
        self.assertTrue(validate_project(self.root, require_final=False)["valid"])
        readiness = validate_project(self.root, require_final=True)
        self.assertFalse(readiness["valid"])
        codes = {issue["code"] for issue in readiness["issues"]}
        self.assertIn("CHAPTER_NOT_FINAL", codes)
        self.assertIn("FINAL_NOT_APPROVED", codes)

    def test_extensionless_import_is_hash_verifiable(self):
        source = Path(self.temp.name) / "README"
        source.write_text("Extensionless source")
        import_source(self.root, source, "extensionless")
        self.assertTrue(validate_evidence(self.root)["valid"])

    def test_import_source_is_idempotent_by_hash_and_starts_unreviewed(self):
        source = Path(self.temp.name) / "paper.pdf"
        source.write_bytes(b"%PDF-1.4 test")
        first = import_source(self.root, source, "paper-one", "Smith2025")
        second = import_source(self.root, source, "paper-one", "Smith2025")
        self.assertEqual(first["status"], "imported")
        self.assertEqual(second["status"], "already-imported")
        self.assertEqual(first["metadata"]["evidence_level"], "metadata-only")
        self.assertTrue(
            (self.root / "research/sources/paper-one/evidence.jsonl").is_file()
        )


if __name__ == "__main__":
    unittest.main()
