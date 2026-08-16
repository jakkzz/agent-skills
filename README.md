# Agent Skills

Portable, safety-first **Agent Skills** for [Claude Code](https://claude.com/claude-code), Pi,
Oh My Pi (OMP), and other compatible coding-agent runtimes.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Seventeen skills spanning research and authoring, code review, frontend testing, and infrastructure operations —
each written around an explicit permission boundary rather than a hopeful prompt.

## Why these exist

Most agent prompts describe what to do. These describe **what the agent may not do, and what it
must confirm first.**

Every operational skill declares three tiers:

- **MAY** — read-only inspection, no confirmation needed
- **MAY NOT without explicit confirmation** — restarts, installs, config changes
- **NEVER** — destructive actions, credential exposure, disabling safety controls

That structure is the point. An agent with shell access to your infrastructure needs a boundary
it cannot rationalize past, and a boundary is more useful than a warning.

Skills are **configuration-driven**: hosts, endpoints, and tokens come from your own SSH config,
environment variables, or runtime integrations. Nothing is hardcoded, and no host inventory ships
with this repository.

## Configuration

| Skill | Reads from |
|---|---|
| `ssh-server-ops`, `ugreen-nas-ops` | Aliases in your `~/.ssh/config` |
| `proxmox-ops` | `PROXMOX_URL`, `PROXMOX_API_KEY` (plus optional secondary target) |
| `home-assistant-control` | `HA_URL`, `HA_TOKEN`, optional `HA_INTERNAL_URL` |
| `local-network-scan` | `LOCAL_NETWORK_SUBNET`, or inferred from the default interface |
| `herdr-tailnet-fleet` | `${HERDR_TAILNET_CONFIG:-~/.config/herdr-tailnet/fleet.json}` |
| `multica-workspace-ops` | `MULTICA_WORKSPACE`, or asks |

Tokens are never printed, echoed, logged, or committed. Skills that handle credentials run inside
isolated shells and explicitly forbid `env`, `printenv`, and command tracing.

## Included skills

| Skill | Purpose |
|---|---|
| `codebase-integrity-review` | Run an adaptive, dry-run audit of code changes and codebases for regressions, conflicts, duplication, SSOT violations, risky hardcoding, and responsibility overload. |
| `playwright-e2e` | Test frontend user flows through isolated headed or headless Playwright Chromium using semantic locators, snapshots, screenshots, and console evidence. |
| `academic-book-project` | Coordinate a persistent academic book workspace with minimal human approval by default and optional stage gates. |
| `academic-literature-discovery` | Run reproducible multi-provider scholarly discovery without confusing metadata with evidence. |
| `academic-source-evidence` | Ingest private sources, maintain page-anchored evidence, and validate atomic claim grounding. |
| `academic-chapter-authoring` | Outline, voice-calibrate, draft, and revise chapters under minimal or stage-gated approval. |
| `academic-book-review` | Run independent factual, subject, structural, pedagogical, style, integrity, and cross-chapter reviews. |
| `karpathy-llm-wiki` | Build and maintain a source-grounded Markdown/Obsidian LLM wiki. |
| `thai-contextual-editor` | Polish, translate, localize, or write native-first Thai while preserving meaning, facts, and protected tokens. |
| `home-assistant-control` | Safely operate a configured Home Assistant integration. |
| `herdr-tab-namer` | Auto-name the current Herdr tab as `workspace - current task` from substantial top-level prompts. |
| `herdr-tailnet-fleet` | Audit and safely maintain Herdr across Tailscale/Headscale SSH hosts. |
| `local-network-scan` | Perform read-only LAN inventory and camera/NVR discovery. |
| `multica-workspace-ops` | Triage ideas and safely operate a configured Multica workspace. |
| `proxmox-ops` | Inspect and safely operate configured Proxmox instances. |
| `ssh-server-ops` | Inspect SSH hosts through local SSH aliases. |
| `ugreen-nas-ops` | Inspect and safely operate a configured UGREEN NAS. |

## Included Pi extensions

| Extension | Purpose |
|---|---|
| `academic-book-studio.ts` | Provide bounded academic-book commands and tools backed by the deterministic book workflow. |
| `herdr-doctor.ts` | Audit Herdr and offer confirmation-gated setup and repair actions. |
| `herdr-tab-namer.ts` | Name Herdr tabs from substantial top-level tasks without exposing likely secrets. |
| `herdr-tailnet.ts` | Audit configured Herdr hosts through control-plane-verified Tailnet routes. |
| `myskill.ts` | Inspect and safely synchronize the canonical shared skill checkout. |
| `playwright.ts` | Provide isolated headed/headless Chromium tools with local, SSH, X11/Wayland, and Herdr display preflight for semantic frontend E2E testing. |
| `thai-editor.ts` | Route `/thai` requests into the contextual Thai editing and calibration workflow. |

## Install

### Pi — official package flow

```bash
pi install git:github.com/jakkzz/agent-skills
```

This loads the declared skills and Pi extensions globally. Run `/reload` in an existing Pi session.

The Playwright extension verifies Chromium on `browser_open` and automatically downloads the Playwright Chromium bundle when it is missing. This is a one-time download; installation progress is shown in the tool result. If automatic installation fails, run the reported fallback command from the installed package directory.

Ask Pi naturally:

```text
Use the Playwright skill to test the frontend E2E at http://localhost:3000.
Use headed mode so I can watch.
```

Headless mode is the default. Before headed runs, the skill checks local, SSH, X11/Wayland, and Herdr-managed display state and refuses to silently downgrade. The extension exposes bounded display/browser verification and automatic first-use installation, navigation, accessibility snapshot, semantic click/fill, keyboard, wait, screenshot, console, and close tools. It uses an isolated ephemeral browser context, rejects non-HTTP(S) navigation, does not expose unrestricted page evaluation, and closes the browser at session shutdown.

### Shared checkout for development or OMP

```bash
git clone git@github.com:jakkzz/agent-skills.git ~/agent-skills
pi install ~/agent-skills
~/agent-skills/scripts/link-shared.sh
```

The link script exposes portable skills through `~/.agents/skills` for OMP and other compatible runtimes. Pi-specific extensions remain package-loaded through the official `pi install` flow.

When Pi runs inside Herdr, the tab-namer extension derives a safe, compact task label from each substantial top-level prompt and renames the tab as `workspace - current task`. It skips slash commands, generic follow-ups, streaming interruptions, and prompts containing likely credentials. Rename the task portion manually with `/herdr-tab-name <label>`.

OMP can also install the Git package directly:

```bash
omp plugin install git@github.com:jakkzz/agent-skills.git
```

## Custom skill synchronization

The Pi extension provides:

```text
/myskill status
/myskill update
```

`/myskill status` refreshes `origin/main` when reachable and reports Git state, shared links, and
Pi top-level skills that would shadow package versions. `/myskill update` accepts only the approved
`jakkzz/agent-skills` origin on branch `main`; pushes go directly to that validated URL and ignore
`remote.origin.pushurl`. It fast-forwards when behind, pushes already-committed changes when ahead,
and stops on dirty, diverged, shadowed, or conflicting checkouts before changing HEAD. It creates
or repairs links under `~/.agents/skills` without overwriting real files or directories. Successful
and explicitly reported partial Git updates reload Pi so runtime state cannot remain silently stale.

## Thai contextual editor

Use one command followed by a natural-language request:

```text
/thai ui
/thai ui attendance
/thai ui learn attendance
/thai apply attendance dry run
/thai ตรวจภาษาไทยใน diff นี้
/thai เขียนข้อความแจ้งเตือนจาก brief นี้: ...
```

`/thai ui [scope]` gathers user-visible Thai UI text into an ignored Markdown worksheet under the
repository Git path. With no scope it covers the complete frontend UI; a scope such as `attendance`
limits the source set. Identical originals are grouped while source paths and keys remain in HTML
comments. Each entry contains the original, a blank line for the user's preferred wording, and `---`.
The command returns `nvim <worksheet-path>`. `/thai ui learn [scope]` validates completed worksheet
pairs, asks for confirmation, and records approved examples under `thai-guide/examples/` without
modifying product source.
`/thai apply <scope> dry run` uses those examples to propose changes without writing files. Omitting
`dry run` still requires a proposal and explicit approval before any write.

There are no mode subcommands or separate machine-local terminology profile. The command routes the
request through the normal coding agent and `thai-contextual-editor` skill, so the agent can inspect
real project context and use normal tools. In a Git project, it reads `thai-guide/README.md`, relevant
domain guidance, and approved examples under `thai-guide/` first.

Manual calibration keeps the user in control: the agent gathers source context but the user writes
preferred wording in the Markdown worksheet. The learn step records only confirmed pairs and never
modifies product source, commits, pushes, or reverts anything. Applying examples is a separate,
explicit request; the agent then proposes bounded changes, waits for approval, and runs validation.

Running `/thai` without arguments opens one editor for the same natural-language request.
`/skill:thai-contextual-editor <request>` routes to the same workflow.

## Academic Book Studio

The package includes the `academic-book-studio.ts` Pi extension, five portable skills, prompt templates, and the deterministic `bookctl` Python core.

Inside Pi, start with:

```text
/book-init [optional-target-directory]
/book-status
```

The default workflow requests a human chapter-brief mandate and one final-packet approval; intermediate phases advance after deterministic checks. Use `stage-gated` mode when every phase needs approval. Human-facing commands include:

```text
/chapter-approve [chapter] [gate]  # one confirmation; approver/note are configured defaults
/chapter-next [chapter]
/chapter-reopen [chapter]
/source-import <path>
/evidence-approve <source-id>
/claim-review <claim-id>
/book-validate
/book-export markdown,docx,pdf,epub,html
```

Prompt templates provide `/book-research`, `/chapter-outline`, `/chapter-draft`, `/chapter-review`, and `/book-final-check`. Model-callable tools are intentionally bounded to status, scholarly discovery, local evidence search, claim validation, and cross-book consistency. Approval remains a human-only command. When Pi starts at a repository root above a nested academic-book workspace, the core automatically selects it only if exactly one `BOOK_STATE.yaml` exists within the bounded descendant search; multiple books require an exact root and fail closed.

Canonical book content is Markdown with Pandoc citation syntax. Zotero plus Better BibTeX can maintain `bibliography/library.bib`; derived DOCX/PDF/EPUB/HTML exports require Pandoc and a reviewed CSL file when the project declares a non-default citation style. Findpapers and PaperQA2 are optional Python extras and are not installed by the Pi package.

See [`docs/academic-book-studio.md`](docs/academic-book-studio.md) for architecture, security, adapters, and the complete workflow.

## Herdr Doctor

The Pi-only `herdr-doctor.ts` adapter audits the local Herdr binary, server, plugin commits, keybindings, Neovim integration, and installed agent integrations. Use `/herdr-doctor` or `/herdr-setup` for a confirmation-gated repair menu, and `/herdr-shortcuts` for gitview, herdr-nvim, file-tree, window, and advanced Vim shortcuts.

Plugin installs are pinned to the commit inspected by the doctor. Config writes use backup plus atomic replacement, and failed plugin/config updates attempt rollback. The audit does not install unrelated missing agent integrations automatically.

See [`docs/herdr-doctor.md`](docs/herdr-doctor.md) for commands and safety behavior.

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

Native Windows can be audited, but Herdr remote attach supports Linux/macOS hosts. For a Windows workstation, enroll WSL as its own Tailnet node and attach to that Linux alias.

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

## Upstream skill and extension references

Third-party resources are installed from their original repositories rather than copied into this custom-skills repository:

| Upstream | What it provides | Pi installation |
|---|---|---|
| [`davis7dotsh/my-pi-setup`](https://github.com/davis7dotsh/my-pi-setup) | Background terminals, subagents, workflows, ask-user, `fd`/`rg`, Firecrawl tools, Git/model UI, summaries, and the GitHub Dark Default theme. | `pi install https://github.com/davis7dotsh/my-pi-setup` |
| [`mattpocock/skills`](https://github.com/mattpocock/skills) | Composable engineering and productivity skills for design, TDD, debugging, review, implementation, research, triage, specifications, tickets, grilling, teaching, and handoffs. | `pi install https://github.com/mattpocock/skills` |
| [`lishix520/academic-paper-skills`](https://github.com/lishix520/academic-paper-skills) | `academic-paper-strategist` and `academic-paper-composer` for philosophy and interdisciplinary paper planning, gap analysis, outlining, drafting, and quality gates. | `pi install https://github.com/lishix520/academic-paper-skills` |
| [`Master-cai/Research-Paper-Writing-Skills`](https://github.com/Master-cai/Research-Paper-Writing-Skills) | `research-paper-writing` for reviewer-oriented ML/CV/NLP abstracts, introductions, related work, methods, experiments, conclusions, and claim-evidence checks. | `pi install https://github.com/Master-cai/Research-Paper-Writing-Skills` |
| [`zazencodes/zazencodes-season-3`](https://github.com/zazencodes/zazencodes-season-3/tree/main) | Reference implementations and videos covering Pi agent fleets, a Pi bookkeeping agent, cross-platform agent skills, literature-review automation, reusable dry-run workflows, and coding-agent practices. | Reference only; install individual projects only when needed. |

The local Pi configuration loads only Matt Pocock's stable `skills/engineering/**` and `skills/productivity/**` trees. It excludes `deprecated`, `in-progress`, and repository-internal skills. The two paper repositories keep skills outside Pi's conventional top-level `skills/` directory, so `~/.pi/agent/settings.json` also points directly to their three `SKILL.md` directories while `pi install` tracks their upstream checkouts. Firecrawl remains optional and requires a locally stored `FIRECRAWL_API_KEY`; never commit that key here.

## Repository policy

This repository contains portable custom skills plus narrowly scoped runtime adapters declared in `package.json`. Package- or product-managed skills and extensions—including the upstream repositories listed above, Computer Use, Orca orchestration, Herdr's upstream integration, Paseo, and Supacode—must be linked or reinstalled from their original packages rather than copied here. The `herdr-tailnet-fleet` skill is an operational safety workflow, not a vendored Herdr integration.

Private IPs, host inventories, runtime IDs, production URLs, and secrets belong in environment variables or ignored local configuration—not Git.

## Add a skill

```text
skills/<skill-name>/SKILL.md
```

Every skill needs explicit `name` and `description` frontmatter. Keep secrets and local identifiers out of Git.

Frontmatter shape:

```yaml
---
name: my-skill
description: >-
  One or two sentences. Start with what it does, then when to use it —
  this is what the runtime matches against.
allowed-tools:
  - bash
---
```

If a skill touches infrastructure, state MAY / MAY NOT / NEVER explicitly. Prefer read-only
discovery first, and ask rather than guess when a target is ambiguous.

## Contributing

Issues and pull requests welcome. Please keep skills configuration-driven — no hostnames, IPs,
credentials, or personal inventories in committed files.

## License

[MIT](LICENSE) — see [`LICENSE`](LICENSE).
