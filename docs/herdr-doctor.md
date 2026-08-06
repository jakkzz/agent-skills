# Herdr Doctor

`extensions/herdr-doctor.ts` is a Pi-only local maintenance adapter for Herdr and Neovim.

## Commands

- `/herdr-doctor` — audit Herdr, the running server, required plugins, keybindings, Neovim, and installed agent integrations; offer confirmation-gated repairs
- `/herdr-setup` — alias for the same setup assistant
- `/herdr-shortcuts` — show gitview, herdr-nvim, file-tree, window, and advanced Vim shortcuts

## Required plugins

- `ChmaraX/herdr-gitview`
- `ChmaraX/herdr-nvim`

The doctor resolves the remote commit before offering installation or update, displays its short hash, and passes the full hash to `herdr plugin install --ref`. If an update fails after removing the previous plugin, it attempts to reinstall the previously recorded commit.

## Neovim

The audit checks Neovim without loading the user's startup configuration. It separately reports whether the normal Neovim config references `herdr-nvim`.

Herdr's sidebar daemon loads the managed Neovim module and calls `setup()` itself. The doctor deliberately does not create a `plugin/herdr-nvim.lua` bridge because that would call setup twice and produce duplicate-keymap warnings. A separate lazy.nvim or packer entry is optional only when annotations are wanted in ordinary Neovim sessions outside Herdr.

## Safety

- Every mutation requires interactive confirmation.
- Config files are backed up as `.bak.<timestamp>` and replaced atomically.
- A failed `herdr server reload-config` restores the previous config.
- Neovim is upgraded through Homebrew only when the active installation is Homebrew-managed.
- Missing unrelated agent integrations are reported but not installed automatically.
- JSON mode receives a structured Pi message rather than raw stdout.

## Tests

```bash
npm test
```

The Herdr Doctor tests cover version comparison, malformed registries, exact keybinding detection, server/integration parsing, action selection, commit-pinned installs, Homebrew ownership checks, and avoidance of duplicate Neovim daemon configuration.
