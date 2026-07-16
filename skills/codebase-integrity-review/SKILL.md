---
name: codebase-integrity-review
description: Dry-run, evidence-based codebase and code-change integrity audit using independent subagent reviewers, followed by adversarial critique and a revised final report. Finds oversized files, conflicts, redundancy, duplicate implementations, SSOT violations, risky hardcoding, configuration drift, and documentation contradictions. Use for thorough code review, architecture integrity review, duplication audits, hardcode audits, or reviewing a Git diff before refactoring or release.
compatibility: Requires Git for change-aware review. Multi-reviewer mode requires a native subagent/delegation tool or a Pi CLI fallback; otherwise the skill must disclose a sequential-review fallback.
allowed-tools: read grep find ls bash subagent
---

# Codebase Integrity Review

Act as a skeptical staff engineer. Audit maintainability and architectural coherence without rewarding abstraction for its own sake.

## Non-Negotiable Mode: Dry Run

Every invocation starts in **DRY RUN** mode.

**MAY:** read source and project documentation, inspect Git history/status/diffs, count lines, search call sites, run safe read-only analysis, query read-only metadata, and propose changes.

**MUST NOT:** edit repository files, apply patches, format code, update dependencies, commit, push, deploy, restart services, mutate databases, or run destructive commands. Do not auto-fix findings.

Temporary files outside the repository are allowed only for passing a diff or draft to isolated reviewers. Remove them after use. Do not print secrets or read ignored `.env` contents; inspect only whether secret-bearing files are tracked or ignored.

Start the final answer with:

```text
DRY RUN — no repository, Git, database, service, or deployment mutations performed.
```

If the user separately asks to apply findings, end this review first and treat implementation as a new, explicitly authorized task.

## Invocation Defaults

- Scope: the current Git repository unless the user supplies a path.
- Change base, in order: user-specified ref; merge-base with the configured upstream; merge-base with the default branch; `HEAD` for working-tree-only changes.
- Include staged, unstaged, and untracked source files in change review.
- If the tree is clean, audit the whole repository.
- Large-file threshold: report relevant source files over 800 physical lines; add a clearly labeled 500–800 watch list when responsibility density warrants it.
- Multi-reviewer budget: four parallel specialist reviewers plus one response critic. If the user supplies a lower budget, obey it.

## Phase 1 — Establish Scope and Safety

1. Resolve the repository root and requested scope.
2. Read every applicable `AGENTS.md`/`CLAUDE.md`, README, architecture document, ADR, manifest, generator/config document, and linked instruction needed for the scope.
3. Capture without changing anything:
   - branch, HEAD, upstream/default branch, and merge-base
   - staged/unstaged/untracked paths
   - diff statistics and changed-file list
   - ignore rules and whether secrets/build artifacts are tracked
4. Classify generated, vendored, minified, lock, snapshot, fixture, migration, and binary files. Do not review them as ordinary source; retain them as contract/history evidence when relevant.
5. State the exact review scope and exclusions.

**Exit:** A change manifest and repository boundary are known.

## Phase 2 — Build an Evidence Bundle

Map important concepts to their definitions and consumers:

- models, schemas, DTOs, enums, validators, and database constraints
- authorization roles, capabilities, state machines, and business thresholds
- environment variables, defaults, flags, URLs, product identifiers, and magic numbers
- routes, commands, registrations, event names, and public interfaces
- formatting, timezones, projections, caches, and denormalized fields
- documentation claims and operational behavior

For changed code, trace both upstream producers and downstream consumers. Record representative `file:line` evidence before forming conclusions.

Search hardcoding by category:

1. **Risky:** credentials/default passwords, environment-specific hosts, tenant/course/user IDs, policy thresholds, duplicated status values, mutable product facts, test IDs in production paths.
2. **Potentially legitimate:** protocol constants, vendor API endpoints, file signatures, standards-defined limits, immutable attribution URLs.
3. **Presentation-only:** copy or labels that still become conflicts when they assert dynamic facts.

Try to disprove each candidate before reporting it.

**Exit:** The parent reviewer has a compact evidence bundle and candidate ownership map.

## Phase 3 — Spawn Independent Reviewers

Use the runtime's native `subagent`, task, or delegation tool when available. Run four reviewers in parallel. Use the exact specialist briefs in [references/reviewer-prompts.md](references/reviewer-prompts.md).

Required reviewers:

1. **Change correctness and regression reviewer**
2. **Architecture, conflict, and SSOT reviewer**
3. **Duplication, redundancy, and oversized-file reviewer**
4. **Hardcoding, configuration, security-default, and documentation-drift reviewer**

Give every reviewer:

- repository root and review base
- changed-file manifest and diff/evidence bundle
- applicable project instructions
- strict read-only constraints
- requirement for exact `file:line` evidence
- requirement to attempt to disprove findings

Subagents must return structured findings, not edits.

### Subagent Fallback

If no native delegation tool exists:

1. Prefer a runtime-supported isolated-agent command.
2. For Pi, invocation of this skill authorizes up to five read-only child reviewers. A safe fallback may spawn isolated `pi -p --no-session` processes with only read/search tools. Pass the diff through a temporary file outside the repository; do not grant edit/write tools.
3. If isolated subprocesses are unavailable, perform four clearly separated sequential passes in the parent context and state: `Subagents unavailable; sequential independent-pass fallback used.` Never pretend subagents ran.

A failed reviewer must not abort the audit. Report the failure and continue with available evidence.

**Exit:** Four independent review outputs or an explicitly disclosed fallback are available.

## Phase 4 — Synthesize and Verify

Merge reviewer outputs with the parent evidence bundle.

For every candidate:

1. Read both definitions and representative consumers.
2. Identify the observable failure, maintenance cost, or divergence risk.
3. Search tests, generators, comments, ADRs, and history for intentional duplication.
4. Distinguish:
   - harmful duplicate authority
   - deliberate boundary translation
   - database/API validation at separate layers
   - immutable migration history
   - test fixtures intentionally mirroring contracts
5. Deduplicate overlapping findings.
6. Calibrate severity:
   - **Critical:** active conflict can cause unsafe, corrupt, or security-sensitive behavior
   - **High:** already divergent or likely to produce incorrect behavior
   - **Medium:** meaningful change risk, redundancy, or responsibility overload
   - **Low:** bounded cleanup opportunity
7. Assign confidence and remove claims that cannot be supported with exact evidence.

For each SSOT finding, name:

- the concept needing one owner
- current competing sources
- recommended canonical source
- derivation/consumer rule
- migration and compatibility risk

For each oversized file, name cohesive extraction seams and a safe migration order. Never recommend arbitrary splitting solely because of line count.

**Exit:** A verified, deduplicated finding set exists.

## Phase 5 — Draft, Critique, and Revise

1. Create a private Draft V1 using the report structure below.
2. Spawn one final **response critic** using the prompt in [references/reviewer-prompts.md](references/reviewer-prompts.md). Give it Draft V1 plus the evidence/finding index.
3. The critic checks:
   - unsupported or overstated claims
   - missed conflicts in changed code
   - false-positive duplication
   - severity and confidence calibration
   - missing canonical owners or migration risks
   - recommendations that would violate project constraints
4. Revise the report using valid criticism. Do not blindly accept critic feedback.
5. Return only the revised final report unless the user asks for reviewer transcripts or Draft V1.

**Exit:** The user receives a second-pass, adversarially reviewed answer.

## Final Report Structure

```markdown
DRY RUN — no repository, Git, database, service, or deployment mutations performed.

## Codebase Integrity Review: <scope>

### Executive Summary
<scope, change base, exclusions, reviewer count/failures, finding counts, verdict>

### Changed-Code Review
<regressions, behavior changes, missing tests, or "no material issues">

### Findings
#### [HIGH][SSOT-1] <concept>
- Evidence: `path:line`, `path:line`
- Competing sources: ...
- Consequence: ...
- Canonical source: ...
- Derivation rule: ...
- Recommendation: ...
- Compatibility risk: ...
- Confidence: High | Medium | Low

### Hardcoding Inventory
| Category | Evidence | Verdict | Recommended owner |

### Oversized Files
| File | Lines | Classification | Responsibilities | Refactor verdict | Proposed seams |

### Canonical Ownership Map
| Concept | Current sources | Recommended owner | Consumer rule |

### Refactor Sequence
1. <small, behavior-preserving step and verification>

### Reviewer Reconciliation
<agreements, rejected claims, unresolved disagreements, failed reviewers>

### Validation and Limitations
<commands run, exclusions, unavailable tools, assumptions>

### Verdict
PASS | PASS WITH RECOMMENDATIONS | REFACTOR ADVISED | CONFLICTS REQUIRE ACTION
```

Order findings by severity, then confidence. Do not pad the report with style preferences. If no meaningful issues exist, say so directly.

## Final Checklist

- [ ] Dry-run banner present and no mutations performed
- [ ] Project instructions and generated-file boundaries respected
- [ ] Changed code and whole-system interactions reviewed
- [ ] Four specialist reviewers ran, or fallback was disclosed
- [ ] Response critic reviewed Draft V1 and final response was revised
- [ ] Every finding has exact evidence, consequence, recommendation, and confidence
- [ ] SSOT findings name canonical owner and derivation path
- [ ] Hardcodes are classified rather than indiscriminately condemned
- [ ] Files over 800 lines are listed; generated exceptions are labeled
- [ ] Reviewer disagreements and limitations are disclosed
