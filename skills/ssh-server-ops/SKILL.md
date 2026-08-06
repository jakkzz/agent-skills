---
name: ssh-server-ops
description: Safely inspect known SSH-accessible servers using local SSH config aliases. Use for read-only health checks, Docker status, routes, logs, and service inventory.
---

# SSH Server Ops

Use local `~/.ssh/config` aliases only. Prefer read-only inspection before mutation.

## Safety

- Use `BatchMode=yes` and connection timeouts.
- Ask before restarts, destructive actions, package upgrades, firewall changes, or Docker prune/down commands.
- Never commit private keys, credentials, or host secrets.

## Host discovery

Read host aliases from local `~/.ssh/config` only. If the requested target does not map unambiguously to an alias, ask the user rather than guessing.

## Safe pattern

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <alias> 'hostname && uptime && df -h'
```
