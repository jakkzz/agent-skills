# Academic Book Studio Workflow

## Phase sequence and exit conditions

The artifact sequence is always preserved. Approval frequency is separate from phase completeness.

| Phase | Canonical artifact | Deterministic exit condition |
|---|---|---|
| brief | `brief.md` | Objective, audience, scope, length, privacy boundary, and delegation exceptions are explicit |
| research-plan | `research-plan.md` | Questions, providers, inclusion/exclusion, and privacy assumptions are complete |
| source-selection | `source-map.yaml` | Curated sources and coverage gaps are documented; an empty selection needs `no_sources_reason` |
| outline | `outline.md` | Section claims, evidence, sequence, and word budget are complete |
| sample | `sample.md` | Voice calibration is recorded in `style-guide.md` |
| draft-v1 | `draft-v1.md` | Complete section draft and continuity report exist |
| review | `reviews/consolidated.md` | All seven independent reports are complete and consolidated |
| revision-plan | `revision-plan.md` | Every finding has a disposition; subjective or exception decisions remain human-owned |
| draft-v2 | `draft-v2.md` | Accepted evidence-safe revisions are applied without overwriting V1 |
| verification | `final-verification.md` | Deterministic checks and independent verification are complete |
| final | `final.md` | Human approves the complete hash-bound chapter packet |

Scaffold text, unresolved markers, missing review reports, or an empty unexplained source selection block a transition.

## Approval modes

### Minimal (default)

Two routine **chapter-phase** approvals per chapter:

1. **Brief mandate** — author approves scope, intended outcome, privacy boundary, voice constraints, and the list of matters that must return for a decision.
2. **Final packet** — author accepts the complete chapter after validation. The final approval stores a manifest of every canonical phase artifact and all seven review reports; changing any packet file makes it stale.

Between those gates the agent may advance phases sequentially after completing the artifact and deterministic checks. Evidence passages and claim-support decisions that the evidence ledger requires from a human should be consolidated into one review packet rather than requested record by record. The agent must not call an intermediate checkpoint “approved” or impersonate a human reviewer.

### Stage-gated

Every phase requires a hash-bound human approval before transition. Use only when the author requests it or external governance requires it.

## Mandatory exception stops

Even in minimal mode, stop and batch a human decision when work would:

- change the approved thesis, scope, audience, chapter objective, or material length;
- send private material to an external service or broaden `privacy_mode`;
- rely on author expertise, waive a permission/rights concern, or make an ethical/legal judgment;
- choose among material contradictory/disputed/unverifiable evidence rather than report it;
- override a blocking independent-review finding;
- make a substantive revision outside the brief or approved evidence boundary;
- publish, export as final, or represent the manuscript as author-approved.

Routine query wording, source deduplication, evidence-safe outline details, prose edits within scope, objective correction of citation/format errors, and accepted noncontroversial review fixes do not need separate interruption.

## Integrity model

A human approval stores the artifact SHA-256. In minimal mode the final record also stores the complete chapter packet manifest. Editing a brief mandate stales its approval. Editing any packet artifact after final approval stales final readiness.

## Human responsibilities

The human retains thesis, interpretation, privacy exceptions, author-expertise claims, ethics, waivers, contested revision decisions, and final approval. The agent may organize, search, extract, draft, critique, and make bounded evidence-safe revisions under the brief mandate; it may not self-approve.

## Reopening research

When drafting or review discovers an evidence gap:

1. Record the exact claim and missing evidence.
2. Do not fill it from model memory.
3. If the gap remains within the approved brief and privacy boundary, reopen the affected phase, research the narrow gap, save a new query ledger, and continue without a routine approval interruption in minimal mode.
4. If it changes scope, privacy, rights, interpretation, or another exception category, ask for one batched human decision first.
5. Re-run downstream checks. A prior final approval must be renewed.

## Files versus chat

Any decision needed by a later session must be written to the workspace. Chat history is not a durable project authority.
