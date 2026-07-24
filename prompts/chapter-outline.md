---
description: Produce a source-mapped academic chapter outline and stop for human approval
argument-hint: "<chapter> [special instructions]"
---
Load `academic-book-project`, `academic-source-evidence`, and `academic-chapter-authoring`.

Prepare the outline for ${1:-the current chapter}. Additional instructions: ${@:2}.

Inspect state and do not proceed unless source selection is approved. For every section include purpose, reader question, atomic claim IDs, supporting and contradictory sources, example, transition, material deferred to another chapter, and word budget. Check prerequisites, total length, chapter objective, and book-level duplication. Write only the canonical outline artifact. Do not draft prose or approve the outline. Stop with a concise human review checklist.
