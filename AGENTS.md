# Agent Skills Repository

This private repository is the canonical source for Jakkrit's portable custom skills.

- Keep each skill at `skills/<name>/SKILL.md`.
- Follow the Agent Skills frontmatter standard with explicit `name` and `description`.
- Keep runtime-specific behavior behind documented prerequisites or thin adapters.
- Never commit secrets, tokens, credentials, customer data, private host inventories, `.env` files, or machine-local runtime IDs.
- Store sensitive and machine-specific values in environment variables or ignored local configuration.
- Do not vendor skills managed by third-party packages; link or reinstall those from their upstream source.
- Test discovery in both Pi and Oh My Pi after changing skill layout or package metadata.
