import tempfile
import unittest
from pathlib import Path

from helpers import prepare_search

from academic_book.io import BookError
from academic_book.project import approve, init_project, transition
from academic_book.search import adapter_status, search


class SearchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "book"
        init_project(
            self.root,
            "Test Book",
            "Education",
            "Graduate students",
            privacy_mode="approved-apis",
            approval_mode="stage-gated",
        )
        prepare_search(self.root)

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def fetcher(url, _headers):
        if "openalex" in url:
            return {
                "results": [
                    {
                        "id": "https://openalex.org/W1",
                        "title": "Shared Study",
                        "publication_year": 2024,
                        "doi": "https://doi.org/10.1000/shared",
                        "authorships": [{"author": {"display_name": "Jane Smith"}}],
                        "abstract_inverted_index": {"Useful": [0], "evidence": [1]},
                        "cited_by_count": 12,
                        "primary_location": {
                            "landing_page_url": "https://example.test",
                            "source": {"display_name": "Journal"},
                        },
                        "best_oa_location": {
                            "pdf_url": "https://example.test/paper.pdf"
                        },
                        "type": "article",
                        "is_retracted": False,
                    }
                ]
            }
        if "crossref" in url:
            return {
                "message": {
                    "items": [
                        {
                            "DOI": "10.1000/shared",
                            "title": ["Shared Study"],
                            "author": [{"given": "Jane", "family": "Smith"}],
                            "issued": {"date-parts": [[2024]]},
                            "container-title": ["Journal"],
                            "is-referenced-by-count": 15,
                            "type": "journal-article",
                        }
                    ]
                }
            }
        raise AssertionError(url)

    def test_search_deduplicates_doi_and_writes_unique_ledger(self):
        first = search(
            self.root,
            "chapter-01",
            "academic evidence",
            ["openalex", "crossref"],
            limit=5,
            year_min=2020,
            fetcher=self.fetcher,
        )
        second = search(
            self.root,
            "chapter-01",
            "academic evidence",
            ["openalex"],
            limit=5,
            fetcher=self.fetcher,
        )
        self.assertEqual(first["raw_records"], 2)
        self.assertEqual(first["deduplicated_records"], 1)
        record = first["records"][0]
        self.assertEqual(record["providers"], ["crossref", "openalex"])
        self.assertEqual(record["citation_count"], 15)
        self.assertNotEqual(first["operation_id"], second["operation_id"])
        self.assertNotEqual(first["result_path"], second["result_path"])
        self.assertTrue(Path(first["ledger_path"]).is_file())

    def test_local_only_blocks_external_search(self):
        private_root = Path(self.temp.name) / "private-book"
        init_project(
            private_root,
            "Private",
            "Field",
            "Reader",
            privacy_mode="local-only",
            approval_mode="stage-gated",
        )
        prepare_search(private_root)
        with self.assertRaisesRegex(BookError, "privacy_mode=local-only"):
            search(
                private_root, "chapter-01", "query", ["openalex"], fetcher=self.fetcher
            )

    def test_unapproved_research_plan_blocks_search(self):
        early_root = Path(self.temp.name) / "early-book"
        init_project(
            early_root,
            "Early",
            "Field",
            "Reader",
            privacy_mode="approved-apis",
            approval_mode="stage-gated",
        )
        with self.assertRaisesRegex(BookError, "source-selection"):
            search(
                early_root, "chapter-01", "query", ["openalex"], fetcher=self.fetcher
            )

    def test_minimal_mode_search_uses_brief_mandate_and_plan_hash(self):
        root = Path(self.temp.name) / "minimal-search"
        init_project(
            root,
            "Minimal",
            "Field",
            "Reader",
            privacy_mode="approved-apis",
        )
        chapter = root / "chapters/chapter-01"
        (chapter / "brief.md").write_text("# Approved mandate\n")
        approve(root, "chapter-01", "brief", "Human")
        transition(root, "chapter-01", "research-plan")
        (chapter / "research-plan.md").write_text("# Complete research plan\n")
        transition(root, "chapter-01", "source-selection")
        result = search(
            root,
            "chapter-01",
            "academic evidence",
            ["openalex"],
            limit=5,
            fetcher=self.fetcher,
        )
        self.assertEqual(result["approval_mode"], "minimal")
        self.assertIsNone(result["research_plan_approval_revision"])
        self.assertEqual(len(result["research_plan_sha256"]), 64)

    def test_adapter_status_is_machine_readable(self):
        result = adapter_status()
        self.assertTrue(result["openalex"]["available"])
        self.assertIn("installed_version", result["findpapers"])


if __name__ == "__main__":
    unittest.main()
