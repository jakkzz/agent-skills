# Jakkrit Agent Skills

Private, portable Agent Skills shared across Pi, Oh My Pi (OMP), and other compatible coding-agent runtimes.

## Included skills

| Skill | Purpose |
|---|---|
| `codebase-integrity-review` | Audit redundancy, conflicting definitions, SSOT violations, and files over 800 lines. |
| `karpathy-llm-wiki` | Build and maintain a source-grounded Markdown/Obsidian LLM wiki. |
| `home-assistant-control` | Safely operate a configured Home Assistant integration. |
| `local-network-scan` | Perform read-only LAN inventory and camera/NVR discovery. |
| `proxmox-ops` | Inspect and safely operate configured Proxmox instances. |
| `ssh-server-ops` | Inspect SSH hosts through local SSH aliases. |
| `ugreen-nas-ops` | Inspect and safely operate a configured UGREEN NAS. |

## Install

### Shared checkout (recommended for Pi + OMP on one machine)

```bash
git clone git@github.com:jakkzz/agent-skills.git ~/agent-skills
~/agent-skills/scripts/link-shared.sh
```

Both runtimes discover `~/.agents/skills`. Run `/reload` in Pi or start a new OMP session after installation.

### Runtime package installation

Install independently when a shared checkout is not desired:

```bash
pi install git:github.com/jakkzz/agent-skills
omp plugin install git@github.com:jakkzz/agent-skills.git
```

The package declares both `pi.skills` and `omp.skills` and uses the conventional `skills/` directory.

## Update

```bash
git -C ~/agent-skills pull
```

## Repository policy

This repository contains only the seven custom skills listed above. Package- or product-managed skills such as Computer Use, Orca orchestration, Herdr, Paseo, and Supacode must be reinstalled from their upstream packages rather than copied here.

Private IPs, host inventories, runtime IDs, production URLs, and secrets belong in environment variables or ignored local configuration—not Git.

## Add a skill

```text
skills/<skill-name>/SKILL.md
```

Every skill needs explicit `name` and `description` frontmatter. Keep secrets and local identifiers out of Git.
