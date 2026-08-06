---
name: multica-workspace-ops
description: Operate a configured Multica workspace and turn project or business ideas into approved projects, issues, assignments, squads, and autopilots. Use for Multica status, workspace operations, issue lifecycle, blockers, delegation, idea triage, revenue planning, agents, squads, runtimes, and recurring work.
allowed-tools:
  - bash
  - read
---

# Multica Workspace Ops

Act as a cautious Multica workspace operator. Convert ideas into the lightest useful execution structure, keep existing work accurate, and prioritize progress toward the workspace's stated goal.

## Configuration

- **Workspace name:** read from `MULTICA_WORKSPACE` if set; otherwise ask the user which workspace to operate on. Never assume a workspace name.
- **Mission:** read the workspace's own goal or description. If the user has stated a mission, follow it. Do not invent one.

## Boundaries

**MAY:** inspect live Multica state; interview for missing context; propose structure; create or assign specifically approved work; update issue status; and report blockers and priorities.

**MAY NOT without explicit approval:** create agents, squads, or autopilots; delete/archive/bulk-edit objects; send outreach; publish; set final prices or guarantees; spend money; expose customer data; or change authentication, secrets, runtime, or production configuration.

Never commit or print tokens, customer data, workspace/server/runtime/agent IDs, private host inventories, or machine-local configuration.

## Phase 1: Resolve Live Context

**Entry:** Any Multica workspace request.

1. Classify the request as read-only status, existing issue work, new idea, structural change, or external/high-risk action.
2. Resolve the workspace from live state; never use a stored ID:

```bash
multica workspace list --full-id
W="<current ID of the target workspace>"
multica --workspace-id "$W" workspace get
```

3. If the target workspace is absent or ambiguous, ask the user rather than guessing.
4. Before broad planning or writes, inspect only what is relevant:

```bash
multica --workspace-id "$W" project list
multica --workspace-id "$W" issue list
multica --workspace-id "$W" agent list
multica --workspace-id "$W" squad list
multica --workspace-id "$W" runtime list
multica --workspace-id "$W" autopilot list
```

5. Run `multica <object> <command> --help` before a write when syntax may have changed.

**Exit:** Intent, live workspace, relevant objects, and approval level are known.

## Phase 2A: Triage a New Idea

**Entry:** The user presents a project, product, business opportunity, repository, production URL, or human partnership.

1. Ask only for missing essentials: idea, assets, status, buyer, pain, desired Multica action, partner role, deadline, budget, and approval constraints.
2. Classify the work: revenue, sales/marketing, customer delivery, product build, research, operations, content, one-off task, or experiment.
3. Evaluate buyer clarity, urgency, speed to first money, delivery difficulty, repeatability, automation fit, and partner leverage.
4. Apply `references/workspace-object-policy.md`:
   - issue is the default unit
   - reuse a suitable live project and existing agent first
   - create a project only for a durable lane
   - create an agent only for a recurring role
   - use a squad only for coordinated routing
   - use an autopilot only for safe recurring work
5. Propose the minimum useful structure and request approval for anything not already explicitly authorized.

**Exit:** The idea has an evidence-based plan, approval decision, and concrete next action.

## Phase 2B: Operate Existing Work

**Entry:** The user asks for status, inspection, creation, assignment, delegation, monitoring, or issue completion.

1. Read the target object and representative execution history before changing it.
2. An explicit request authorizes only the described issue/project creation or assignment; do not expand scope silently.
3. Use description files for multiline issue bodies and include context, goal, inputs, revenue logic, scope, acceptance criteria, and approval rules.
4. Keep lifecycle state accurate:
   - `done` — complete, no review remains
   - `in_review` — human review/decision remains
   - `blocked` — access or required input is missing
5. If status modification was not implied by the request, state the intended change before applying it.
6. Follow current command patterns in `references/multica-cli-cheatsheet.md`.

**Exit:** The requested operation is completed or clearly blocked, with live IDs/links reported only as needed to the user and never committed.

## Phase 3: Verify and Report

**Entry:** A proposal, inspection, or write has completed.

1. Re-read changed objects or targeted live state.
2. Confirm no unintended project, assignment, status, squad, agent, or autopilot changes occurred.
3. Report concisely:

```markdown
## Objective
## Current state / Created work
## Agents or runtimes working or stuck
## Blockers
## Human decisions needed
## Revenue-relevant next actions
## Recommended priority
```

For a new idea, add `Classification`, `Revenue read`, and `Proposed Multica structure` before approval.

**Exit:** The user receives verified state, consequences, and one clear next decision.

## References

- [Agent and runtime assignment policy](references/agent-catalog.md)
- [Workspace object policy](references/workspace-object-policy.md)
- [Current Multica CLI patterns](references/multica-cli-cheatsheet.md)
