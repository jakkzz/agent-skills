---
name: multica-idea-triage
description: Interview-style intake for Jakkrit's project/business ideas, then converts approved ideas into MoneyOS Multica projects, issues, agent assignments, squad assignments, and optional autopilots. Use when the user has a project idea, business idea, app/repo/production URL, human partner, or asks to create/assign work in Multica/MoneyOS.
---

# Multica Idea Triage

Use this skill when Jakkrit brings a new project idea, product idea, app/repo, production URL, business opportunity, or human partner and wants it turned into structured Multica execution.

Default mission:

```text
Help Jakkrit reach $1,000/day by 2026-12-31 through practical AI/software/business execution.
```

This skill is an interview-first controller. Do not blindly create projects, agents, squads, or autopilots.

## Operating mode

Follow this loop:

```text
Idea → interview → classify → propose Multica plan → ask approval → create/assign/monitor
```

If the user only provides a rough idea, interview until you have enough information to produce a Multica plan.

If the user explicitly says to create items and enough info exists, create the minimum useful structure.

## Required before acting

Always verify live state before recommending or creating anything:

```bash
multica workspace list --full-id
multica project list
multica agent list
multica squad list
multica runtime list
```

Use current live output over this skill's static references. Resolve the current MoneyOS workspace ID from `multica workspace list --full-id`, then pass it with `--workspace-id` for every workspace-scoped command. Never hardcode a workspace ID, server URL, runtime ID, agent ID, or access token in this repository.

## Intake interview

Ask only the missing questions. Do not overwhelm the user if they already gave enough context.

Minimum useful intake:

1. Brief idea
2. Repo URL/path if an app exists
3. Production URL if live
4. Current status: idea / prototype / live / has users / has revenue
5. Target buyer/user
6. Desired outcome in Multica: propose only or create now
7. Human partner info, if any: person, skills, role, availability, constraints

Use this template when helpful:

```md
## Idea
Short description:

## Existing assets
Repo:
Production URL:
Docs/designs:
Customers/users/revenue:

## Buyer / market
Who pays or benefits:
Pain:
Urgency:

## Human partner
Name:
Skills:
Availability:
Role:
Constraints:

## Desired Multica action
- propose only
- create issue only
- create/use project + issues
- assign to agent/squad
- propose new agent/squad

## Constraints
Deadline:
Budget:
Do not do:
Needs approval before:
```

## Classification

Classify the idea as one or more:

- Revenue project
- Sales/marketing asset
- Customer delivery
- Product/app build
- Research/validation
- Ops/runtime maintenance
- Content/education
- One-off task
- Experiment/backlog

Then score it quickly:

- Buyer clarity
- Urgent pain
- Speed to first money
- Delivery difficulty
- Repeatability
- 24/7 automation fit
- Human partner leverage

## Multica object rules

### Projects

Create a project only for durable lanes with clear outcome, buyer/revenue link, or ops purpose.

Do not create a project for every idea.

Prefer existing projects discovered from live state. Use a general business/operations project such as `Business HQ` only if it currently exists and fits the work.

Create a new project only when the idea deserves its own durable lane.

### Issues

Issues are the normal unit of work. Create issues more freely than projects.

For revenue ideas, prefer starter issues such as:

1. Validate buyer and painful workflow
2. Define paid offer and pricing logic
3. Research 20-50 leads or comparable buyers
4. Draft outreach / demo / sales asset
5. Build smallest proof or audit checklist
6. Decide go / no-go after evidence

### Agents

Use existing agents first. Do not create agents unless a recurring role is clearly needed.

A new agent needs:

- recurring job
- runtime/tool choice
- scope
- max concurrency
- instructions
- 24/7 requirement decision

### Squads

Use squads only when multiple agents need coordinated routing.

A squad needs:

- leader agent
- member roles
- clear delegation rule
- when to assign to squad instead of individual agent

Never create squads just for aesthetics.

### Autopilots / 24-7 loops

Use autopilots only for recurring work that can run without harming customers or public state.

Good autopilot candidates:

- daily revenue blocker review
- daily lead research queue
- daily active-project status summary
- weekly kill/continue review
- weekly offer asset review
- runtime health checks

Autopilot output should usually create issues, not directly publish or contact customers.

## Approval gates

Ask Jakkrit before:

- creating a new project unless he explicitly requested creation
- creating a new agent
- creating a new squad
- creating autopilots or recurring jobs
- deleting, archiving, or bulk-changing Multica data
- sending customer outreach
- publishing public copy
- setting final prices or guarantees
- making customer/company-specific claims
- spending money
- changing auth/runtime/config/secrets

Use this approval prompt:

```text
I can create this in Multica now. Approve?

Will create:
- Project: ...
- Issues: ...
- Assignment: ...
- Autopilot: ...

I will not send outreach, publish, or change auth/config.
```

## Creation workflow

1. Verify live workspace/projects/agents/squads/runtimes.
2. Draft proposed structure.
3. Ask approval unless the user already explicitly approved creation.
4. Create project only if justified.
5. Create issues with detailed descriptions.
6. Assign to existing agent/squad if obvious.
7. Add labels/status/priority if useful.
8. Return links/IDs and next human decision.

## Issue description standard

Every issue created from this skill should include:

```md
## Context

## Goal

## Inputs
- Idea:
- Repo:
- Production URL:
- Human partner:

## Revenue logic
- Buyer:
- Pain:
- Why now:
- Expected path to money:

## Scope

## Acceptance criteria

## Approval rules
Do not publish, send outreach, set final prices, spend money, or change auth/config without Jakkrit approval.
```

## Output format

When proposing, use:

```md
## Classification

## Revenue read

## Recommended Multica structure
- Project:
- Issues:
- Assignment:
- Squad/autopilot:

## Questions before creation

## Approval needed
```

When completed, use:

```md
Created in MoneyOS:
- Project: ...
- Issues: ...
- Assigned to: ...

Next decision needed:
...
```

## References

- [Agent catalog](references/agent-catalog.md)
- [MoneyOS object policy](references/moneyos-object-policy.md)
- [Multica CLI cheatsheet](references/multica-cli-cheatsheet.md)
