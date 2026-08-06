from academic_book.project import approve, status, transition


def advance_to(root, target_phase, approved_by="Test Human"):
    while True:
        current = status(root)
        phase = current["chapter_phase"]
        if phase == target_phase:
            return
        artifact = root / current["current_artifact"]
        if phase == "source-selection":
            artifact.write_text(
                '{"schema_version":1,"chapter":"chapter-01","sources":[]}\n'
            )
        else:
            artifact.write_text(f"# Reviewed {phase}\n\nTest fixture content.\n")
        if phase == "review":
            for review in (root / "chapters/chapter-01/reviews").glob("*.md"):
                review.write_text(
                    f"# Completed {review.stem} review\n\nNo blocking fixture finding.\n"
                )
        approve(root, "chapter-01", phase, approved_by, "Test approval")
        transition(root, "chapter-01", current["next_phase"])


def approve_final(root, approved_by="Test Human"):
    advance_to(root, "final", approved_by)
    approve(root, "chapter-01", "final", approved_by, "Final test approval")


def prepare_search(root):
    advance_to(root, "source-selection")
