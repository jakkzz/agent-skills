---
description: Produce a source-mapped academic chapter outline under the configured approval mode
argument-hint: "<chapter> [special instructions]"
---
Load `academic-book-project`, `academic-source-evidence`, and `academic-chapter-authoring`.

Prepare the outline for ${1:-the current chapter}. Additional instructions: ${@:2}.

Inspect state and proceed only when source selection is complete and authorized by `approval_mode`. For every section include purpose, reader question, atomic claim IDs, supporting and contradictory sources, example, transition, material deferred to another chapter, and word budget. Check prerequisites, total length, chapter objective, and book-level duplication. Write only the canonical outline artifact and never approve it yourself. In minimal mode, continue after deterministic checks unless an exception requires one batched human decision; in stage-gated mode, stop with a concise approval checklist.
