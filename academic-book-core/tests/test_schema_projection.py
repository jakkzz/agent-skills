import json
import tempfile
import unittest
from pathlib import Path

from academic_book.evidence import EVIDENCE_LEVELS, EVIDENCE_RELATIONS
from academic_book.project import (
    BOOK_PHASES,
    OUTPUT_FORMATS,
    PHASES,
    PRIVACY_MODES,
    init_project,
)


class SchemaProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schemas = Path(__file__).resolve().parents[1] / "schemas"

    def schema(self, name):
        return json.loads((self.schemas / name).read_text())

    def test_schema_enums_match_runtime_authority(self):
        chapter = self.schema("chapter-state.schema.json")
        book = self.schema("book-state.schema.json")
        evidence = self.schema("evidence.schema.json")
        claim = self.schema("claim.schema.json")
        self.assertEqual(chapter["properties"]["phase"]["enum"], PHASES)
        self.assertEqual(set(book["properties"]["phase"]["enum"]), BOOK_PHASES)
        self.assertEqual(set(book["properties"]["privacy_mode"]["enum"]), PRIVACY_MODES)
        self.assertEqual(
            set(book["properties"]["output_formats"]["items"]["enum"]), OUTPUT_FORMATS
        )
        self.assertEqual(
            set(evidence["properties"]["evidence_level"]["enum"]), EVIDENCE_LEVELS
        )
        self.assertEqual(
            set(evidence["properties"]["relation"]["enum"]), EVIDENCE_RELATIONS
        )
        self.assertEqual(
            set(claim["properties"]["evidence_level"]["enum"]), EVIDENCE_LEVELS
        )

    def test_initialized_state_contains_schema_required_fields(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "book"
            init_project(root, "Book", "Field", "Reader")
            state = json.loads((root / "BOOK_STATE.yaml").read_text())
            schema = self.schema("book-state.schema.json")
            self.assertTrue(set(schema["required"]).issubset(state))
            self.assertTrue(
                set(schema["properties"]["project"]["required"]).issubset(
                    state["project"]
                )
            )


if __name__ == "__main__":
    unittest.main()
