---
name: codebase-integrity-review
description: Evidence-based codebase audit for redundancy, duplicate implementations, conflicting definitions, and single-source-of-truth violations. Also identifies files over 800 lines and proposes responsibility-based refactors. Use when asked to check duplication, duplicacy, redundancy, conflicts, SSOT, oversized files, codebase integrity, or refactoring opportunities.
allowed-tools: Read Grep Glob Bash
---

# Codebase Integrity Review

Act as a skeptical staff engineer auditing maintainability and architectural coherence. Find real duplication and conflicting ownership without rewarding abstraction for its own sake.

## Boundaries

**This skill MAY:** read code and project documentation, inspect history and call sites, run read-only searches/checks, and propose refactors.
**This skill MAY NOT:** edit files, delete code, commit changes, or claim duplication from superficial similarity alone.

This is a review, not an implementation. Do not modify the repository unless the user separately asks to apply accepted recommendations.

## Phase 1: Establish Scope

**Entry:** The skill is invoked with an optional path or scope.

1. Use the supplied path; otherwise audit the current repository.
2. If there are multiple plausible repositories or no clear project root, ask which target to review.
3. Read applicable `AGENTS.md`, `CLAUDE.md`, README, architecture docs, ADRs, manifests, and generator/config documentation.
4. Check repository status and ignore rules. Identify generated, vendored, minified, lock, snapshot, fixture, and migration files so they are not treated as ordinary source.
5. For a very large repository, state the inspected scope and prioritize core application code, shared libraries, schemas, configuration, and public interfaces.

**Exit:** Review scope, project conventions, exclusions, and likely architectural boundaries are known.

## Phase 2: Build the Ownership Map

**Entry:** Project context is loaded.

Map important concepts to their current definitions and consumers. Search for:

- domain models, types, interfaces, enums, schemas, and validators
- constants, defaults, environment variables, feature flags, and configuration
- routes, commands, event names, dependency registrations, and exports
- business rules, formatters, adapters, and utility functions
- database schema, API contracts, generated clients, and documentation claims

For each repeated concept, determine whether one definition is authoritative, generated from another, intentionally boundary-specific, or accidentally duplicated. Trace representative call sites before judging ownership.

**Exit:** Candidate canonical sources and competing definitions are identified.

## Phase 3: Audit Four Dimensions

**Entry:** Ownership candidates are available.

### A. Redundancy and duplication

Find exact copies, near-copies, parallel implementations of the same rule, dead wrappers, repeated constants, and abstractions that add no independent behavior. Distinguish harmful duplication from deliberate isolation, test fixtures, compatibility layers, and small local code that is clearer than premature reuse.

### B. Conflicts

Look for incompatible defaults, divergent types or schemas, contradictory validation, duplicate route/handler registration, stale documentation, inconsistent naming with behavioral impact, and config precedence that can produce different answers.

### C. Single source of truth

For every genuine SSOT issue, name:

1. the concept that needs one owner
2. the current competing sources
3. the recommended canonical source
4. how other representations should derive from or reference it
5. migration and compatibility risks

Do not call two representations an SSOT violation when they serve distinct boundaries and require explicit translation.

### D. Files over 800 lines

Measure physical lines for relevant source files. Exclude generated/vendor/minified/lock/snapshot files and clearly label other exceptions. A file exceeding 800 lines is a review trigger, not automatic evidence of poor design.

Propose extraction only when the file has multiple responsibilities or stable seams. Name concrete modules to extract, their responsibilities, dependencies, public interfaces, and a safe migration order. Prefer a cohesive 900-line file over arbitrary fragmentation.

**Exit:** Candidate findings and oversized-file recommendations are documented.

## Phase 4: Verify Findings

**Entry:** Candidate findings exist.

For each candidate:

1. Read both definitions and representative consumers.
2. Identify the observable failure, maintenance cost, or divergence risk.
3. Search for tests, generators, comments, ADRs, or history that explain the duplication.
4. Try to disprove the finding; downgrade or remove it when intent is legitimate.
5. Record exact `file:line` evidence and confidence.
6. Run only targeted read-only validation commands when useful; report commands and failures honestly.

Severity guide:

- **Critical:** active conflict can cause incorrect, unsafe, or corrupt behavior
- **High:** competing authorities are likely to diverge or already do
- **Medium:** meaningful redundancy or oversized responsibility increases change risk
- **Low:** cleanup opportunity with limited operational risk

**Exit:** Every reported finding has evidence, consequence, and a defensible recommendation.

## Phase 5: Report

**Entry:** Findings are verified.

Use this structure:

```markdown
## Codebase Integrity Review: <scope>

### Executive Summary
<scope, exclusions, counts, and overall verdict>

### Findings
#### [HIGH][SSOT-1] <concept>
- Evidence: `path:line`, `path:line`
- Competing sources: ...
- Consequence: ...
- Canonical source: ...
- Recommendation: ...
- Confidence: High | Medium | Low

### Oversized Files
| File | Lines | Responsibilities | Refactor verdict | Proposed seams |

### Canonical Ownership Map
| Concept | Current sources | Recommended owner | Derivation/consumer rule |

### Refactor Sequence
1. <small, behavior-preserving step and verification>

### Validation and Limitations
<commands run, excluded areas, assumptions, and uninspected scope>

### Verdict
PASS | PASS WITH RECOMMENDATIONS | REFACTOR ADVISED | CONFLICTS REQUIRE ACTION
```

Order findings by severity, then confidence. Do not pad the report with style preferences. If no meaningful issues exist, say so directly.

Example finding: two files both parse the same environment variable with different defaults is an SSOT conflict; two API-boundary DTOs with explicit conversion are probably intentional separation.

**Exit:** The user receives an evidence-backed review and an actionable, behavior-preserving refactor proposal.

## Final Check

- [ ] Project instructions, scope, exclusions, and generated-file boundaries were respected
- [ ] Duplication and conflicts were verified through consumers and observable consequences
- [ ] Each SSOT/refactor recommendation names an owner, derivation path, and cohesive extraction seam
- [ ] No repository files were modified
