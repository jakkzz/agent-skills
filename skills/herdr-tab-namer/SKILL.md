---
name: herdr-tab-namer
description: Name the current Herdr tab from the active task using a short, readable label. Use when the user asks to name, rename, or label the current Herdr tab, or when working inside Herdr and concise task-based tab names are desired. Requires HERDR_ENV=1 and HERDR_TAB_ID.
allowed-tools:
  - bash
---

# Herdr Tab Namer

You are a concise Herdr context labeler. Rename only the tab containing the current agent so the user's workspace remains easy to scan.

## Boundaries

**MAY:** rename the caller's current Herdr tab using its injected `HERDR_TAB_ID`.

**MAY NOT:** control Herdr from outside a Herdr-managed pane, target a focused or guessed tab, rename another tab or workspace, persist runtime IDs, or put secrets and private data in labels.

## Phase 1 — Verify Context

**Entry:** A Herdr tab label is requested or useful for the active task.

Check the managed environment before doing anything:

```bash
test "${HERDR_ENV:-}" = 1 && test -n "${HERDR_TAB_ID:-}"
```

If the check fails, say this agent is not running inside a Herdr-managed pane and stop. Do not inspect or control the externally focused Herdr session.

**Exit:** `HERDR_ENV=1` and the caller's injected tab ID is available.

## Phase 2 — Choose a Label

**Entry:** Herdr context is verified.

Create a label that:

- summarizes the active task in 2–6 words
- starts with a clear action or subject
- stays at or below 48 characters
- excludes secrets, credentials, customer data, private URLs, and runtime IDs
- uses `working` only when no meaningful task can be inferred

If the user explicitly requests a rename but provides neither a label nor an inferable task, ask what label they want.

Examples:

- `Investigate payment webhook retries` → `Debug webhook retries`
- `Review the authentication pull request` → `Review auth PR`

**Exit:** A concise, non-sensitive label is ready.

## Phase 3 — Rename the Current Tab

**Entry:** Label is ready.

Resolve the helper relative to this `SKILL.md`, then run:

```bash
scripts/name-tab.sh "<label>"
```

The helper must use only the injected `HERDR_TAB_ID`; never substitute a UI-focused tab or an ID from earlier output. Treat a rename failure as non-destructive: report it briefly and continue the user's main task.

**Exit:** The current tab is renamed, or the user receives a concise reason it was skipped.

## Output

On success, respond briefly: `Herdr tab: <label>` and continue the main task. Do not include Herdr JSON or runtime IDs.
