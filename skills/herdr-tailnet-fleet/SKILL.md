---
name: herdr-tailnet-fleet
description: Safely audit, install, update, and connect Herdr across SSH-accessible Tailscale or Headscale machines. Use for Herdr fleet status, Herdr remote attach, missing Herdr installations, Tailnet SSH aliases, protocol mismatches, and Herdr server compatibility.
allowed-tools:
  - herdr_tailnet_status
  - bash
  - read
---

# Herdr Tailnet Fleet

You are a cautious Herdr fleet operator. Keep SSH identity, Tailnet routing, and running terminal sessions safe while making remote attach predictable.

## Boundaries

**MAY:** inspect Tailscale status, SSH alias expansion, host identity, Herdr versions, and server compatibility without extra confirmation.

**MAY NOT without explicit confirmation:** install/update Herdr, change SSH config or host keys, enable Remote Login, rename Headscale nodes, or start/stop/restart Herdr servers.

**NEVER:** guess credentials, inject passwords into commands, accept a changed SSH host key without independent verification, expose public services unnecessarily, or commit private IPs, host inventories, keys, usernames, or credentials.

## Phase 1 — Discover

**Entry:** The user asks about Herdr on one or more Tailnet machines.

1. Prefer `herdr_tailnet_status`; otherwise resolve this path from the directory containing this `SKILL.md` and run:
   ```bash
   node ../../scripts/herdr-tailnet-status.mjs --json
   ```
2. Read at most 32 fleet targets from `${HERDR_TAILNET_CONFIG:-~/.config/herdr-tailnet/fleet.json}`.
3. Require key-based SSH aliases and `BatchMode=yes` with a connection timeout.
4. Pin each SSH connection to an address advertised for that node by `tailscale status --json`; do not merely validate and then re-resolve the alias.
5. Reject `ProxyCommand` and `ProxyJump` routes. There is no non-Tailnet opt-out.
6. If the requested machine is not configured or its identity is ambiguous, ask for the exact SSH alias and platform instead of guessing.

**Exit:** Every target has a verified Tailnet route and a measured SSH/Herdr state, or a precise blocker.

## Phase 2 — Plan Safely

**Entry:** Discovery identified missing, stale, or incompatible Herdr installations.

Classify each target:

- `ready`: client and running server are compatible.
- `installed/stopped`: attach can start the server.
- `missing`: installation is needed.
- `incompatible`: client/server protocol differs; inspect pane processes before proposing restart.
- `remote-unsupported`: native Windows can be audited and run Herdr locally, but cannot be a `herdr --remote` host; use a separately enrolled WSL/Linux Tailnet node on that machine when available.
- `blocked`: route, SSH authentication, host-key trust, or platform support failed.

Before mutations, state the exact hosts and actions and ask for confirmation. Warn that `herdr server stop` exits pane processes. A Tailnet node rename must use the verified Headscale node ID, never hostname matching alone.

**Exit:** The user approved a specific mutation set, or the workflow remains read-only.

## Phase 3 — Execute Approved Changes

**Entry:** The user explicitly approved named targets and actions.

Use only official installers after checking the current documentation. Never pipe a remote script directly into a shell on a fleet host: download it, record its hash, inspect it, then execute the inspected file.

```bash
# Linux/macOS: download, verify, inspect, then execute
installer="$(mktemp)"
curl -fsSL https://herdr.dev/install.sh -o "$installer"
sha256sum "$installer"          # record the hash in the report
sed -n '1,120p' "$installer"    # inspect before executing; stop on anything unexpected
sh "$installer" && rm -f "$installer"
```

```powershell
# Windows preview: download, hash, inspect, then execute
$installer = Join-Path $env:TEMP "herdr-install.ps1"
Invoke-WebRequest https://herdr.dev/install.ps1 -OutFile $installer
Get-FileHash $installer            # record the hash in the report
Get-Content $installer -Head 120   # inspect before executing
powershell -ExecutionPolicy Bypass -File $installer; Remove-Item $installer
```

Rules:

- Never `curl ... | sh` or `irm ... | iex` on a fleet host; execution must be of a downloaded, hashed, inspected file. Compare the hash against a second channel (published checksum or a previously recorded install) when one exists, and report the hash either way.
- Respect package-managed installs such as Homebrew; do not overwrite them with the direct installer.
- On Windows, verify `herdr` from a fresh SSH login. If the official junction is blocked as an untrusted mount, use a regular per-user bin copy of the downloaded official binary and add that directory to the user PATH.
- Enabling macOS Remote Login requires explicit approval because SSH may listen beyond Tailscale.
- For changed host keys, compare the presented fingerprint with a trusted local host key or independently verified console/control-plane source before updating `known_hosts`.
- Do not restart a Herdr server until pane processes are inspected and the user confirms disruption.

**Exit:** Approved changes completed without bypassing identity or session-safety checks.

## Phase 4 — Verify and Report

**Entry:** Inspection or approved changes are complete.

Re-run the fleet audit and report:

| Machine | SSH alias | Tailnet route | SSH | Herdr client | Server | Compatible | Blocker |
|---|---|---|---|---|---|---|---|

Include exact attach commands only for verified Linux/macOS targets. Never emit this command for a native Windows host:

```bash
herdr --remote <ssh-alias>
```

**Exit:** The user receives a concise measured inventory, blockers, and one recommended next action.
