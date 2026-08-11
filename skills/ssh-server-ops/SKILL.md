---
name: ssh-server-ops
description: Safely inspect known SSH-accessible servers using local SSH config aliases. Use for read-only health checks, Docker status, routes, logs, and service inventory.
---

# SSH Server Ops

Use local `~/.ssh/config` aliases only. Prefer read-only inspection before mutation.

## Safety

- Use `BatchMode=yes` and connection timeouts.
- OK without extra confirmation: hostname/uptime/disk, service and container listings, network ports, routes, and bounded recent logs.
- Ask explicit confirmation, naming the exact host and command, before: restarts, package upgrades, firewall changes, Docker prune/down, or any file edit.
- Never do without explicit, separately confirmed target and action: deleting data or volumes, changing users/passwords/permissions, wiping disks, disabling security controls, or host reboot/shutdown.
- If a command fails for lack of privileges, report it; do not escalate to `sudo` automatically.
- Never commit private keys, credentials, or host secrets, and do not print sensitive log excerpts in the final reply.

## Host discovery

Read host aliases from local `~/.ssh/config` only. If the requested target does not map unambiguously to an alias, ask the user rather than guessing.

## Safe pattern

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <alias> 'hostname && uptime && df -h'
```
