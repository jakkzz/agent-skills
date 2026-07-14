---
name: multica-moneyos
description: Operate the MoneyOS Multica workspace safely through the current Multica CLI. Use for inspecting workspace status, projects, issues, agents, squads, runtimes, blockers, and revenue-focused next actions.
---

# Multica MoneyOS

Use this skill for MoneyOS workspace operations.

## Safety

- Read live state before writing.
- Do not send customer outreach, publish copy, change pricing, spend money, delete or archive objects, or alter production/runtime configuration without explicit approval.
- Keep tokens, API keys, private customer data, workspace IDs, server URLs, runtime IDs, and machine-local configuration out of Git and logs.
- Run `multica <object> <command> --help` before a write when command syntax may have changed.

## Workspace resolution

Never rely on a hardcoded or globally selected workspace. Resolve MoneyOS from live state:

```bash
multica workspace list --full-id
```

Select the workspace named `MoneyOS`, then pass its current ID explicitly:

```bash
W="<MoneyOS workspace ID from live output>"
multica --workspace-id "$W" workspace get
```

If MoneyOS is missing or ambiguous, stop and ask rather than guessing.

## Read-only checks

```bash
multica --workspace-id "$W" project list
multica --workspace-id "$W" agent list
multica --workspace-id "$W" squad list
multica --workspace-id "$W" issue list
multica --workspace-id "$W" runtime list
multica --workspace-id "$W" autopilot list
```

For one issue:

```bash
multica --workspace-id "$W" issue get <issue-id>
multica --workspace-id "$W" issue runs <issue-id>
```

## Issue lifecycle discipline

When completing issue work, leave the issue in an accurate state:

- `done` when work is complete and no review remains
- `in_review` when a human decision or review remains
- `blocked` when required access or input is missing

Never leave completed work in `todo` or `in_progress`. Inspect the issue and report the intended status change before applying it when the user's request did not already authorize issue updates.

```bash
multica --workspace-id "$W" issue status <issue-id> <done|in_review|blocked>
```

## Creation and assignment

Issues are the default work unit. Reuse existing projects and agents when appropriate. Use `multica-idea-triage` for new ideas or structural planning.

An explicit request to create or assign the described work authorizes that specific creation/assignment. Ask separately before creating new agents, squads, or autopilots, or before destructive, public, customer-facing, pricing, spending, auth, or runtime changes.

## Operating report

1. Current objective
2. Active issues
3. Agents/runtimes working or stuck
4. Blockers
5. Human decisions needed
6. Revenue-relevant next actions
7. Recommended priority

Prioritize paid revenue, validation, conversion, delivery capacity, and operational leverage over generic productivity work.
