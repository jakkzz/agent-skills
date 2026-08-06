import json
import subprocess
import tempfile
import unittest
from pathlib import Path


class CliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo = Path(__file__).resolve().parents[2]
        cls.script = cls.repo / "scripts/bookctl.py"

    def run_cli(self, *args):
        return subprocess.run(
            ["python3", str(self.script), *map(str, args)],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_source_checkout_cli_end_to_end(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "book"
            init = self.run_cli(
                "--json",
                "--root",
                root,
                "init",
                "--title",
                "CLI Book",
                "--field",
                "Education",
                "--audience",
                "Researchers",
            )
            self.assertEqual(init.returncode, 0, init.stderr)
            status = self.run_cli("--json", "--root", root, "status")
            self.assertEqual(status.returncode, 0, status.stderr)
            payload = json.loads(status.stdout)
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["result"]["book_title"], "CLI Book")
            self.assertEqual(payload["result"]["approval_mode"], "minimal")

    def test_status_discovers_one_nested_book_from_repository_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary) / "repository"
            book = repository / "references" / "drone" / "academic-book"
            init = self.run_cli(
                "--json",
                "--root",
                book,
                "init",
                "--title",
                "Nested Book",
                "--field",
                "Engineering",
                "--audience",
                "Students",
            )
            self.assertEqual(init.returncode, 0, init.stderr)

            status = self.run_cli("--json", "--root", repository, "status")
            self.assertEqual(status.returncode, 0, status.stderr)
            payload = json.loads(status.stdout)
            self.assertEqual(payload["result"]["root"], str(book.resolve()))
            self.assertEqual(payload["result"]["book_title"], "Nested Book")

    def test_status_rejects_ambiguous_nested_books(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary) / "repository"
            for name in ("book-a", "book-b"):
                init = self.run_cli(
                    "--json",
                    "--root",
                    repository / "references" / name,
                    "init",
                    "--title",
                    name,
                    "--field",
                    "Engineering",
                    "--audience",
                    "Students",
                )
                self.assertEqual(init.returncode, 0, init.stderr)

            status = self.run_cli("--json", "--root", repository, "status")
            self.assertEqual(status.returncode, 2)
            payload = json.loads(status.stderr)
            self.assertIn("Multiple BOOK_STATE.yaml files", payload["error"])
            self.assertIn("pass --root", payload["error"])

    def test_fail_on_findings_returns_nonzero_with_json_result(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "book"
            self.run_cli(
                "--root",
                root,
                "init",
                "--title",
                "CLI Book",
                "--field",
                "Education",
                "--audience",
                "Researchers",
            )
            result = self.run_cli(
                "--json", "--fail-on-findings", "--root", root, "validate"
            )
            self.assertEqual(result.returncode, 3)
            self.assertFalse(json.loads(result.stdout)["result"]["valid"])

    def test_consistency_is_read_only_without_flag(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "book"
            self.run_cli(
                "--root",
                root,
                "init",
                "--title",
                "CLI Book",
                "--field",
                "Education",
                "--audience",
                "Researchers",
            )
            result = self.run_cli("--root", root, "consistency")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((root / "build/consistency-report.json").exists())


if __name__ == "__main__":
    unittest.main()
