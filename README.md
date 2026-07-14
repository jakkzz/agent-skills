# Jakkrit Agent Skills

Private, portable Agent Skills shared across Pi, Oh My Pi (OMP), and other compatible coding-agent runtimes.

## Included skills

| Skill | Purpose |
|---|---|
| `codebase-integrity-review` | Audit redundancy, conflicting definitions, SSOT violations, and files over 800 lines. |
| `karpathy-llm-wiki` | Build and maintain a source-grounded Markdown/Obsidian LLM wiki. |
| `home-assistant-control` | Safely operate a configured Home Assistant integration. |
| `herdr-tailnet-fleet` | Audit and safely maintain Herdr across Tailscale/Headscale SSH hosts. |
| `local-network-scan` | Perform read-only LAN inventory and camera/NVR discovery. |
| `multica-jakkrit` | Triage ideas and safely operate Jakkrit's live MoneyOS Multica workspace. |
| `proxmox-ops` | Inspect and safely operate configured Proxmox instances. |
| `ssh-server-ops` | Inspect SSH hosts through local SSH aliases. |
| `ugreen-nas-ops` | Inspect and safely operate a configured UGREEN NAS. |

## Install

### Pi — official package flow

```bash
pi install git:github.com/jakkzz/agent-skills
```

This loads the declared skills and Pi extensions globally. Run `/reload` in an existing Pi session.

### Shared checkout for development or OMP

```bash
git clone git@github.com:jakkzz/agent-skills.git ~/agent-skills
pi install ~/agent-skills
~/agent-skills/scripts/link-shared.sh
```

The link script exposes portable skills through `~/.agents/skills` for OMP and other compatible runtimes. Pi-specific extensions remain package-loaded through the official `pi install` flow.

OMP can also install the Git package directly:

```bash
omp plugin install git@github.com:jakkzz/agent-skills.git
```

## Herdr Tailnet fleet setup

The Pi extension contributes the read-only `herdr_tailnet_status` tool and `/herdr-fleet` command. It pins each SSH connection to an address advertised by the active Tailscale control plane and rejects aliases using `ProxyCommand` or `ProxyJump`.

Create machine-local configuration without committing private inventory:

```bash
mkdir -p ~/.config/herdr-tailnet
cat > ~/.config/herdr-tailnet/fleet.json <<'JSON'
{
  "version": 1,
  "hosts": [
    { "name": "workstation", "sshAlias": "workstation-tail", "platform": "unix" },
    { "name": "windows-box", "sshAlias": "windows-tail", "platform": "windows" }
  ]
}
JSON
$EDITOR ~/.config/herdr-tailnet/fleet.json
```

A development checkout also includes `config/herdr-tailnet.example.json`. Override the local path with `HERDR_TAILNET_CONFIG`. Each entry needs a display name, an existing SSH alias, and `platform` set to `unix` or `windows`; fleets are limited to 32 hosts.

The extension is intentionally read-only. Installation, SSH trust changes, node renames, and Herdr server restarts remain confirmation-gated workflows in the skill.

## Update

For the Git package:

```bash
pi update git:github.com/jakkzz/agent-skills
```

For a development checkout:

```bash
git -C ~/agent-skills pull
```

## Repository policy

This repository contains portable custom skills plus narrowly scoped runtime adapters declared in `package.json`. Package- or product-managed skills such as Computer Use, Orca orchestration, Herdr's upstream integration, Paseo, and Supacode must be reinstalled from their upstream packages rather than copied here. The `herdr-tailnet-fleet` skill is an operational safety workflow, not a vendored Herdr integration.

Private IPs, host inventories, runtime IDs, production URLs, and secrets belong in environment variables or ignored local configuration—not Git.

## Add a skill

```text
skills/<skill-name>/SKILL.md
```

Every skill needs explicit `name` and `description` frontmatter. Keep secrets and local identifiers out of Git.
