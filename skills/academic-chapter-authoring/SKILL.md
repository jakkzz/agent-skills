---
name: academic-chapter-authoring
description: Produce an evidence-grounded academic chapter through brief, outline, voice sample, drafting, and controlled revision. Use when interviewing the author, outlining, drafting a sample or section, maintaining chapter boundaries, or applying review findings. Honors minimal or stage-gated approval mode and preserves prior versions.
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

Run `book_status`. Work only on the artifact for the current phase. Read `approval_mode`: in `minimal`, stop routinely only for the brief mandate and final packet; in `stage-gated`, stop at every phase.

## Brief

Interview the author for audience, starting knowledge, chapter objective, central claim or lesson, required topics, excluded/deferred topics, target length, examples, exercises, relationship to adjacent chapters, privacy boundary, and exception triggers. Save answers to `brief.md`; stop for the chapter mandate approval.

## Outline

Do not outline until research/source selection is complete and authorized by the configured approval mode. Every section needs:

- purpose
- reader question
- claim IDs
- supporting and contradictory sources
- example or illustration
- transition from the previous section
- expected word count
- material explicitly deferred elsewhere

Check that the total matches the chapter target and the progression fulfills the objective. Save to `outline.md`. In minimal mode, validate and continue without asking for routine approval unless the outline changes the brief or exposes an exception.

## Voice sample

Draft only the introduction and one representative substantive section in `sample.md`. Calibrate formality, sentence length, first-person use, citation density, technical level, examples, terminology, and Thai/English handling. In minimal mode, derive calibration from the approved book style and brief, record it in `style-guide.md`, and continue unless a subjective voice choice cannot be resolved within those authorities.

## Draft V1

Draft one requested section at a time into `draft-v1.md`.

- Follow the current validated outline and approved brief mandate.
- Use only registered evidence or clearly marked author expertise.
- Keep citation keys attached to the claims they support.
- Preserve source disagreements and limitations.
- Do not invent transitions that introduce new facts.
- Mark gaps exactly as `[AUTHOR INPUT REQUIRED: ...]`, `[EVIDENCE GAP: ...]`, or `[PERMISSION CHECK: ...]`.
- Do not rewrite other sections merely to make the new prose fit; report needed changes.

After all sections, run a continuity pass that reports repetition, contradictions, undefined terms, missing transitions, unresolved promises, and material belonging elsewhere. In minimal mode, continue to independent review without a routine Draft V1 approval.

## Revision

Reviewers produce findings. In minimal mode, automatically apply objective evidence, citation, consistency, and within-brief corrections; defer subjective, scope-changing, disputed, rights, ethics, author-expertise, waiver, and blocking-finding decisions into one batched author request. In stage-gated mode, the author decides every item. Do not overwrite V1, alter citation meaning, or add new factual claims without returning to evidence work.

## Final

`final.md` is produced only after Draft V2 and verification are complete. In minimal mode, one human final-packet approval accepts the hash-bound chapter artifacts; in stage-gated mode, the existing Draft V2 and verification approvals also apply. The model never approves or represents its own prose as author-approved.

See [workflow](../academic-book-project/references/workflow.md) and [review roles](../academic-book-project/references/review-roles.md).
