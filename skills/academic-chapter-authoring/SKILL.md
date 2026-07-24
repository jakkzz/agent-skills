---
name: academic-chapter-authoring
description: Produce an evidence-grounded academic book chapter through brief, approved outline, voice sample, section-by-section drafting, and controlled revision. Use when interviewing the author, outlining a chapter, drafting a sample or section, maintaining chapter boundaries, or applying an approved revision plan. Stops at human gates and preserves prior versions.
compatibility: Academic Book Studio workspace with BOOK_STATE.yaml.
---

# Academic Chapter Authoring

## Always begin

Read:

- `BOOK_STATE.yaml`
- `book-brief.md`
- `style-guide.md`
- `glossary.yaml`
- current `CHAPTER_STATE.yaml`
- current chapter brief, source map, research notes, and preceding chapter final where relevant

Run `book_status`. Work only on the artifact for the current phase.

## Brief

Interview the author for audience, starting knowledge, chapter objective, central claim or lesson, required topics, excluded/deferred topics, target length, examples, exercises, and relationship to adjacent chapters. Save answers to `brief.md`; stop for approval.

## Outline

Do not outline until research/source selection is approved. Every section needs:

- purpose
- reader question
- claim IDs
- supporting and contradictory sources
- example or illustration
- transition from the previous section
- expected word count
- material explicitly deferred elsewhere

Check that the total matches the chapter target and the progression fulfills the objective. Save to `outline.md`; stop for approval.

## Voice sample

Draft only the introduction and one representative substantive section in `sample.md`. Calibrate formality, sentence length, first-person use, citation density, technical level, examples, terminology, and Thai/English handling. Save accepted decisions in `style-guide.md`; stop for sample approval.

## Draft V1

Draft one requested section at a time into `draft-v1.md`.

- Follow the approved outline.
- Use only registered evidence or clearly marked author expertise.
- Keep citation keys attached to the claims they support.
- Preserve source disagreements and limitations.
- Do not invent transitions that introduce new facts.
- Mark gaps exactly as `[AUTHOR INPUT REQUIRED: ...]`, `[EVIDENCE GAP: ...]`, or `[PERMISSION CHECK: ...]`.
- Do not rewrite other sections merely to make the new prose fit; report needed changes.

After all sections, run a continuity pass that reports repetition, contradictions, undefined terms, missing transitions, unresolved promises, and material belonging elsewhere. Stop for Draft V1 approval.

## Revision

Reviewers produce findings; the author decides `accept`, `reject`, `modify`, `needs-author-input`, or `defer`. Apply only approved changes to `draft-v2.md`. Do not overwrite V1, alter citation meaning, or add new factual claims without returning to evidence work.

## Final

`final.md` is produced only after Draft V2 and `final-verification.md` are human-approved. The model never calls its own prose final.

See [workflow](../academic-book-project/references/workflow.md) and [review roles](../academic-book-project/references/review-roles.md).
