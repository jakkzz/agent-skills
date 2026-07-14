# MoneyOS Agent and Runtime Catalog

This file defines assignment policy, not a static inventory. Always inspect live state:

```bash
multica agent list
multica squad list
multica runtime list
```

Do not store agent IDs, runtime IDs, hostnames, private machine details, or availability snapshots in this repository.

## Catalog fields

For each candidate agent, determine from live state or user-provided context:

- Name and recurring purpose
- Provider/runtime type
- Repository, network, and local-file access
- Online and 24/7 availability
- Cost and operational risk
- Suitable tasks
- Tasks to avoid
- Actions requiring human approval

## Assignment heuristics

- Local files or desktop state: use an online runtime on the machine that owns the data.
- Long unattended work: use a verified stable runtime with the required access.
- Coding: match language/tooling and repository access.
- Research/writing: choose an available agent with suitable tools and cost.
- Strategy/business triage: use a general coordination agent or an approved revenue squad.
- Destructive, public, customer-facing, pricing, spending, auth, or production work: add explicit approval gates; do not dispatch autonomously by default.

## New agent policy

Create an agent only for a recurring role that existing agents cannot cover. Ask approval first and state:

- recurring job
- runtime and model
- scope and instructions
- required access
- maximum concurrency
- 24/7 requirement
- cost/risk

## Squad policy

Create a squad only when multiple recurring roles need coordinated routing. Ask approval first and define:

- leader
- member roles
- routing rule
- expected inputs and outputs
- conditions for using a squad instead of one agent
