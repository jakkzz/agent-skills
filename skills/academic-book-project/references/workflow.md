# Academic Book Studio Workflow

## Phase gates

| Phase | Canonical artifact | Exit condition |
|---|---|---|
| brief | `brief.md` | Author approves objective, audience, scope, and length |
| research-plan | `research-plan.md` | Author approves questions, providers, inclusion/exclusion, and privacy assumptions |
| source-selection | `source-map.yaml` | Author approves the curated sources and documented coverage gaps |
| outline | `outline.md` | Author approves section claims, evidence, sequence, and word budget |
| sample | `sample.md` | Author approves voice and records calibration in `style-guide.md` |
| draft-v1 | `draft-v1.md` | Complete section draft and continuity report approved |
| review | `reviews/consolidated.md` | Independent reviews completed and consolidated |
| revision-plan | `revision-plan.md` | Every proposed change has a human decision |
| draft-v2 | `draft-v2.md` | Approved revisions applied without overwriting V1 |
| verification | `final-verification.md` | Deterministic and human checks complete |
| final | `final.md` | Human approves final chapter |

An approval stores the artifact SHA-256. Editing an approved artifact makes its approval stale. A stale or missing gate cannot transition.

## Human responsibilities

The human owns the thesis, interpretation, source selection judgment, voice, ethics, acceptance of revisions, waivers, and final approval. The agent may organize, search, draft, and critique; it may not self-approve.

## Reopening research

When drafting or review discovers an evidence gap:

1. Record the exact claim and missing evidence.
2. Do not fill it from model memory.
3. Research the narrow gap and save a new query ledger.
4. Run `/chapter-reopen` to return to the affected phase.
5. Update evidence/source maps and reacquire the target and downstream approvals.

## Files versus chat

Any decision needed by a later session must be written to the workspace. Chat history is not a durable project authority.
