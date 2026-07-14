# Jakkrit Agent Skills

Private, portable Agent Skills shared across Pi, Oh My Pi (OMP), and other compatible coding-agent runtimes.

## Included skills

| Skill | Purpose |
|---|---|
| `codebase-integrity-review` | Audit redundancy, conflicting definitions, SSOT violations, and files over 800 lines. |

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

## Candidate custom skills to migrate

Good portable candidates after removing machine-specific values:

- `karpathy-llm-wiki`
- `home-assistant-control` (requires the matching HA tools/extension)
- `local-network-scan`
- `multica-idea-triage`
- `multica-moneyos`
- `proxmox-ops`
- `ssh-server-ops`
- `ugreen-nas-ops`

Do not copy package- or product-managed skills such as Computer Use, Orca orchestration, Herdr, Paseo, or Supacode. Reinstall those from their upstream packages.

Before migrating personal operations skills, replace private IPs, host lists, workspace IDs, production URLs, and other machine-specific values with environment variables or ignored local configuration.

## Add a skill

```text
skills/<skill-name>/SKILL.md
```

Every skill needs explicit `name` and `description` frontmatter. Keep secrets and local identifiers out of Git.
