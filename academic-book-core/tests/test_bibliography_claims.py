import tempfile
import unittest
from pathlib import Path

from academic_book.bibliography import (
    extract_citation_keys,
    parse_bibtex,
    validate_bibliography,
)
from academic_book.claims import add_claim, review_claim, validate_claims
from academic_book.evidence import add_evidence, validate_evidence
from academic_book.io import read_jsonl, write_jsonl
from academic_book.project import init_project
from academic_book.sources import import_source

BIB = """@article{Smith2025,
  title = {Evidence for Academic Writing},
  author = {Smith, Jane},
  year = {2025},
  doi = {10.1000/example}
}
"""


class BibliographyAndClaimsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "book"
        init_project(self.root, "Test Book", "Education", "Graduate students")
        (self.root / "bibliography/library.bib").write_text(BIB)
        source = Path(self.temp.name) / "paper.txt"
        source.write_text("Evidence text")
        import_source(self.root, source, "paper-one", "Smith2025")

    def tearDown(self):
        self.temp.cleanup()

    def test_parse_and_validate_bibliography(self):
        entries, warnings = parse_bibtex(BIB)
        self.assertFalse(warnings)
        self.assertEqual(entries[0].key, "Smith2025")
        self.assertEqual(entries[0].fields["doi"], "10.1000/example")
        self.assertEqual(
            validate_bibliography(self.root / "bibliography/library.bib")["issues"], 0
        )

    def test_extract_parenthetical_and_textual_pandoc_citations(self):
        markdown = (
            "````text\n``` @FencedHidden\n````\n"
            "@Smith2025 argues. Sentence final @Jones2024. "
            "Leading underscore @_Archive2020; internal @Smith:2025? "
            "Another [@Lee2023, p. 4]. `@CodeNotCitation`; "
            "``@DoubleCode and `literal` ``; ``before ``` @LongRunHidden ``; "
            "and \\@EscapedLiteral."
        )
        self.assertEqual(
            extract_citation_keys(markdown),
            {"Smith2025", "Jones2024", "_Archive2020", "Smith:2025", "Lee2023"},
        )

    def test_reviewed_evidence_and_claim_pass(self):
        evidence = add_evidence(
            self.root,
            "paper-one",
            "full-text",
            "p. 2, Results",
            "Reviewed evidence text.",
            "Human",
        )
        claim = add_claim(
            self.root,
            "chapter-01",
            "1.2",
            "A carefully bounded empirical claim.",
            "empirical",
            ["paper-one"],
            [evidence["evidence_id"]],
            "full-text",
            "p. 2, Results",
            ["Smith2025"],
        )
        pending = validate_claims(self.root)
        self.assertIn(
            "CLAIM_PENDING_HUMAN_REVIEW", {issue["code"] for issue in pending["issues"]}
        )
        review_claim(self.root, claim["claim_id"], "supported", "Human")
        self.assertTrue(validate_evidence(self.root)["valid"])
        self.assertTrue(validate_claims(self.root)["valid"], validate_claims(self.root))

    def test_source_replacement_or_deletion_invalidates_evidence(self):
        add_evidence(
            self.root,
            "paper-one",
            "full-text",
            "p. 2",
            "Reviewed evidence.",
            "Human",
        )
        managed = self.root / "research/sources/paper-one/source-private.txt"
        managed.write_text("Replaced after review")
        codes = {issue["code"] for issue in validate_evidence(self.root)["issues"]}
        self.assertIn("SOURCE_HASH_MISMATCH", codes)
        managed.unlink()
        codes = {issue["code"] for issue in validate_evidence(self.root)["issues"]}
        self.assertIn("MANAGED_SOURCE_FILE_COUNT", codes)

    def test_claim_review_becomes_stale_after_claim_change(self):
        evidence = add_evidence(
            self.root,
            "paper-one",
            "full-text",
            "p. 2",
            "Reviewed evidence.",
            "Human",
        )
        claim = add_claim(
            self.root,
            "chapter-01",
            "1.2",
            "Original claim.",
            "empirical",
            ["paper-one"],
            [evidence["evidence_id"]],
            "full-text",
            "p. 2",
            ["Smith2025"],
        )
        review_claim(self.root, claim["claim_id"], "supported", "Human")
        records = read_jsonl(self.root / "claims/claims.jsonl")
        records[0]["claim"] = "Changed after review."
        write_jsonl(self.root / "claims/claims.jsonl", records)
        codes = {issue["code"] for issue in validate_claims(self.root)["issues"]}
        self.assertIn("STALE_CLAIM_REVIEW", codes)

    def test_claim_review_outcome_mutation_is_stale(self):
        evidence = add_evidence(
            self.root,
            "paper-one",
            "full-text",
            "p. 2",
            "Reviewed evidence.",
            "Human",
        )
        claim = add_claim(
            self.root,
            "chapter-01",
            "1.2",
            "Outcome-bound claim.",
            "empirical",
            ["paper-one"],
            [evidence["evidence_id"]],
            "full-text",
            "p. 2",
            ["Smith2025"],
        )
        review_claim(self.root, claim["claim_id"], "contradicted", "Human")
        records = read_jsonl(self.root / "claims/claims.jsonl")
        records[0]["support"] = "supported"
        write_jsonl(self.root / "claims/claims.jsonl", records)
        codes = {issue["code"] for issue in validate_claims(self.root)["issues"]}
        self.assertIn("STALE_CLAIM_REVIEW", codes)

    def test_contradicted_claim_is_not_exportable(self):
        evidence = add_evidence(
            self.root,
            "paper-one",
            "full-text",
            "p. 2",
            "Contradictory evidence.",
            "Human",
            relation="contradicts",
        )
        claim = add_claim(
            self.root,
            "chapter-01",
            "1.2",
            "Claim contradicted by its evidence.",
            "empirical",
            ["paper-one"],
            [evidence["evidence_id"]],
            "full-text",
            "p. 2",
            ["Smith2025"],
        )
        review_claim(self.root, claim["claim_id"], "contradicted", "Human")
        codes = {issue["code"] for issue in validate_claims(self.root)["issues"]}
        self.assertIn("NON_EXPORTABLE_CLAIM_OUTCOME", codes)

    def test_claim_cannot_inflate_metadata_to_full_text(self):
        claim = add_claim(
            self.root,
            "chapter-01",
            "1.2",
            "An unsupported empirical claim.",
            "empirical",
            ["paper-one"],
            [],
            "full-text",
            "invented locator",
            ["Smith2025"],
        )
        review_claim(self.root, claim["claim_id"], "supported", "Human")
        result = validate_claims(self.root)
        codes = {issue["code"] for issue in result["issues"]}
        self.assertIn("NO_REVIEWED_EVIDENCE", codes)
        self.assertIn("SOURCE_WITHOUT_EVIDENCE", codes)
        self.assertFalse(result["valid"])

    def test_unknown_evidence_and_bibliography_block(self):
        claim = add_claim(
            self.root,
            "chapter-01",
            "1.2",
            "A mismatched claim.",
            "empirical",
            ["missing-source"],
            ["missing-evidence"],
            "abstract",
            None,
            ["MissingKey"],
        )
        review_claim(self.root, claim["claim_id"], "partial", "Human")
        result = validate_claims(self.root)
        codes = {issue["code"] for issue in result["issues"]}
        self.assertIn("UNKNOWN_SOURCE", codes)
        self.assertIn("UNKNOWN_EVIDENCE", codes)
        self.assertIn("MISSING_BIB_ENTRY", codes)


if __name__ == "__main__":
    unittest.main()
