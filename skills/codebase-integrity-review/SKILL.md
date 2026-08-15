---
name: codebase-integrity-review
description: Adaptive, evidence-based, read-only review of Git changes or codebase integrity. Finds regressions, conflicting ownership, harmful duplication, risky hardcoding, configuration drift, oversized responsibility boundaries, and documentation contradictions. Use for deep code review, architecture integrity, duplication or hardcode audits, and pre-release assessment.
compatibility: Requires Git for change-aware review. Delegation is optional; disclose sequential fallback when isolated reviewers are unavailable.
allowed-tools: read grep find ls bash subagent
---

# Codebase Integrity Review
Act as a skeptical staff engineer. Find material correctness and maintainability risks without rewarding abstraction for its own sake. Empty findings are valid; reviewers have no finding quota.

## Safety Contract
Every invocation is a **DRY RUN**.

**MAY:** read source, documentation, Git metadata/history/diffs, ignored-file names, and read-only tool output; run checks that do not write repository files; propose changes.

**MUST NOT:** edit or format files, install/update dependencies, run code generation or writing builds, commit, push, deploy, restart services, mutate databases, inspect ignored secret contents, or print secrets.

Start the final answer with:

```text
DRY RUN — no repository, Git, database, service, or deployment mutations performed.
```

Implementation requested afterward is a new, explicitly authorized task.

## Iteration and Validation Budget

- Run at most two dry-run rounds unless the user explicitly requests more. A second round verifies remediation; it does not restart discovery.
- Never loop toward a numeric confidence target. Report residual risk and what evidence would raise confidence, then stop.
- During authorized remediation, use focused checks for intermediate work and run the complete release baseline once at the end of the increment. Prefer a fresh session and written handoff for each long-running increment.

## Modes and Defaults

Select the narrowest mode matching the request:

- **diff** — regressions, contract changes, and missing verification in staged, unstaged, untracked, and branch changes.
- **integrity** — ownership, duplication, configuration, hardcoding, documentation drift, and responsibility boundaries.
- **targeted** — one concern or path named by the user.
- **full** — diff plus repository integrity; use only when requested or clearly necessary for release/architecture assessment.

Default to **diff** when relevant changes exist; otherwise use **integrity**. State mode, root, base, included paths, and exclusions.

Resolve the base in order: user ref; upstream merge-base; default-branch merge-base; `HEAD` for working-tree-only changes.

## Phase 1 — Establish Context

1. Resolve repository root, mode, base, and requested scope.
2. Read applicable `AGENTS.md`/`CLAUDE.md`, README, architecture docs, ADRs, manifests, and linked instructions needed for that scope.
3. Capture branch, HEAD, base, staged/unstaged/untracked paths, diff statistics, and changed files.
4. Classify generated, vendored, minified, lock, snapshot, fixture, migration, and binary files. Treat them as contract/history evidence, not ordinary source.
5. Discover documented test, type-check, lint, and validation commands. Run only those known not to write repository files; otherwise report them as skipped.

**Exit:** scope, instructions, change manifest, exclusions, and safe validation plan are known.

## Phase 2 — Build a Compact Evidence Index

Record evidence as:

```yaml
repo_root: ...
mode: diff | integrity | targeted | full
base: ...
changed_files: [...]
risk_domains: [...]
instructions: [...]
exclusions: [...]
validation: [...]
candidates:
  - concept: ...
    evidence: [path:line, path:line]
```

Trace relevant definitions to representative producers and consumers: schemas, authorization, state machines, thresholds, configuration, routes, public interfaces, projections, caches, and documentation claims.

Classify hardcodes as risky, intentional protocol/vendor constants, standards-defined invariants, or presentation-only. Evaluate responsibility density—reasons to change, dependency breadth, public surface, and testability—before using line count. Source files over 800 lines are discovery candidates; 500–800 lines belong on a watch list only when responsibilities are mixed.

Try to disprove every candidate using tests, generators, comments, ADRs, history, and boundary semantics.

**Exit:** a bounded evidence index and candidate set exist.

## Phase 3 — Choose Review Depth

Use adaptive depth rather than mandatory fan-out:

- **Small:** up to 10 changed files and about 400 changed lines, low risk — one primary reviewer.
- **Standard:** broader or cross-module work — primary reviewer plus one relevant specialist.
- **Deep:** large, security/data-sensitive, release-critical, or explicit full audit — up to four specialists and a response critic.

Available specialist briefs are in [references/reviewer-prompts.md](references/reviewer-prompts.md). Select only relevant reviewers:

1. correctness/regression — default for diff mode;
2. architecture/SSOT — ownership or contract changes;
3. duplication/responsibility — broad refactors or explicit maintainability audit;
4. configuration/documentation — config, deployment, policy, hardcode, or docs risk.

Give reviewers the repository root, base, scope, applicable instructions, compact evidence index, and shared safety contract. Let them inspect relevant files directly; do not embed an unbounded repository diff.

Prefer native delegation. If unavailable, perform clearly separated sequential passes and state: `Subagents unavailable; sequential independent-pass fallback used.` Reviewer failure does not abort the audit.

**Exit:** proportionate independent review evidence is available.

## Phase 4 — Verify and Reconcile

The parent reviewer must independently verify every reported finding:

1. Confirm exact `file:line` evidence and representative consumers.
2. State an observable failure or concrete divergence mechanism.
3. Distinguish introduced, exposed, pre-existing, and unrelated issues.
4. Reject intentional boundary translation, immutable migrations, mirrored test fixtures, and small local similarity unless actual drift or behavior risk exists.
5. Deduplicate findings and calibrate severity:
   - **Critical:** exploitable security, corruption, unsafe operation, or credible outage path.
   - **High:** reproducible incorrect behavior in a supported path.
   - **Medium:** concrete divergence/regression mechanism without a demonstrated current failure.
   - **Low:** bounded maintainability debt without demonstrated behavior risk.
6. Require corroborating evidence for Medium-or-higher architectural claims unless one location independently demonstrates the defect.
7. For SSOT findings, name the concept, competing sources, canonical owner, derivation rule, and migration risk.
8. For responsibility overload, name cohesive seams and a behavior-preserving migration order; never split solely by line count.

Use a response critic only for Deep reviews, Critical/High findings, or explicit user request. Validate criticism rather than accepting it automatically.

**Exit:** unsupported claims are removed and remaining findings are verified.

## Final Report

Always include the dry-run banner and these sections:

```markdown
## Codebase Integrity Review: <scope>
### Executive Summary
<mode, base, scope, exclusions, reviewer depth/failures, validation, finding counts>

### Findings
#### [HIGH][CATEGORY-1] <title>
- Evidence: `path:line`, `path:line`
- Relationship: introduced | exposed | pre-existing | unrelated
- Consequence: ...
- Attempted disproof: ...
- Recommendation: ...
- Confidence: High | Medium | Low

### Validation and Limitations
### Verdict
PASS | PASS WITH RECOMMENDATIONS | REFACTOR ADVISED | CONFLICTS REQUIRE ACTION
```

Add Changed-Code Review, Hardcoding Inventory, Oversized Files, Canonical Ownership Map, Refactor Sequence, or Reviewer Reconciliation only when they contain material information. Order findings by severity then confidence. Do not pad the report with style preferences.

## Final Checklist

- [ ] Dry-run contract respected and banner present
- [ ] Scope, mode, base, instructions, and exclusions stated
- [ ] Review depth was proportionate and fallback/failures disclosed
- [ ] Safe project validations were run or explicitly skipped
- [ ] Every finding has exact evidence, consequence, attempted disproof, recommendation, and confidence
- [ ] Severity reflects observable impact rather than architectural dislike
- [ ] Clean, finding-free results were allowed
