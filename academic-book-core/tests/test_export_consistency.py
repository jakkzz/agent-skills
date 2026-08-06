import tempfile
import unittest
from pathlib import Path

from helpers import advance_to

from academic_book.consistency import check_consistency
from academic_book.exporter import export_book
from academic_book.io import BookError
from academic_book.project import approve, init_project, status

BIB = """@book{Smith2025,
  title = {Evidence Book},
  author = {Smith, Jane},
  year = {2025}
}
"""


class ExportConsistencyTests(unittest.TestCase):
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
        (self.root / "bibliography/library.bib").write_text(BIB)

    def tearDown(self):
        self.temp.cleanup()

    def test_export_refuses_unapproved_or_stale_final(self):
        (self.root / "chapters/chapter-01/final.md").write_text("# Draft\n")
        with self.assertRaisesRegex(BookError, "not export-ready"):
            export_book(self.root, ["markdown"])
        advance_to(self.root, "final")
        approve(self.root, "chapter-01", "final", "Human")
        final = self.root / "chapters/chapter-01/final.md"
        final.write_text(final.read_text() + "\nChanged after approval.\n")
        with self.assertRaisesRegex(BookError, "not export-ready"):
            export_book(self.root, ["markdown"])

    def test_markdown_export_filters_textual_citation(self):
        advance_to(self.root, "final")
        self.assertEqual(status(self.root)["book_phase"], "review")
        (self.root / "chapters/chapter-01/final.md").write_text(
            "# Chapter 1\n\n@Smith2025 provides a grounded example.\n"
        )
        approve(self.root, "chapter-01", "final", "Human")
        self.assertEqual(status(self.root)["book_phase"], "complete")
        result = export_book(self.root, ["markdown"])
        self.assertTrue(Path(result["outputs"]["markdown"]).is_file())
        cited = (self.root / "bibliography/cited.bib").read_text()
        self.assertIn("Smith2025", cited)

    def test_consistency_detects_marker_and_missing_citation(self):
        (self.root / "chapters/chapter-01/final.md").write_text(
            "# Chapter 1\n\n[evidence gap: missing]\nClaim [@Unknown].\n"
        )
        result = check_consistency(self.root)
        codes = {issue["code"] for issue in result["issues"]}
        self.assertIn("UNRESOLVED_MARKER", codes)
        self.assertIn("MISSING_CITATION", codes)
        self.assertFalse(result["valid"])


if __name__ == "__main__":
    unittest.main()
