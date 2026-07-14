# Multica CLI Cheatsheet for MoneyOS

Verify the installed CLI and current workspace before writes:

```bash
multica --help
multica workspace list --full-id
W="<MoneyOS workspace ID from live output>"
```

Never commit the resolved ID or server URL.

## Inspect

```bash
multica --workspace-id "$W" project list
multica --workspace-id "$W" agent list
multica --workspace-id "$W" squad list
multica --workspace-id "$W" runtime list
multica --workspace-id "$W" issue list
multica --workspace-id "$W" autopilot list
```

## Create project

Confirm current flags with `multica project create --help`.

```bash
multica --workspace-id "$W" project create \
  --title "Project title" \
  --description "Project description" \
  --status in_progress \
  --output json
```

Attach repositories only when requested:

```bash
multica --workspace-id "$W" project create \
  --title "Project title" \
  --repo "https://github.com/owner/repo" \
  --output json
```

## Create issue

Use a file for multiline or non-ASCII descriptions:

```bash
cat > /tmp/moneyos-issue.md <<'DESC'
## Context

## Goal

## Acceptance criteria

## Approval rules
DESC

multica --workspace-id "$W" issue create \
  --title "Issue title" \
  --description-file /tmp/moneyos-issue.md \
  --project "PROJECT_ID" \
  --priority high \
  --output json
```

Assign by a live name or ID:

```bash
multica --workspace-id "$W" issue assign ISSUE_ID --to "AGENT_OR_SQUAD_NAME"
multica --workspace-id "$W" issue assign ISSUE_ID --to-id AGENT_OR_SQUAD_ID
```

## Update issue status

Valid statuses include `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, and `cancelled`:

```bash
multica --workspace-id "$W" issue status ISSUE_ID done
```

## Create structural objects

Create agents, squads, or autopilots only after the approval rules in the parent skill are satisfied. Check live syntax first:

```bash
multica agent create --help
multica squad create --help
multica autopilot create --help
multica autopilot trigger-add --help
```

Never pass real secrets through command-line arguments. For agent environment or MCP secrets, use the CLI's stdin/file options and secure local files.
