import assert from "node:assert/strict";
import test from "node:test";
import { availableActions, type Audit } from "../extensions/herdr-doctor.ts";

function audit(overrides: Partial<Audit> = {}): Audit {
  return {
    herdrFound: true,
    herdrVersion: "0.7.5",
    herdrLatest: "0.7.5",
    herdrManagedByBrew: true,
    serverStatus: "running v0.7.5",
    plugins: [
      { id: "chmarax.gitview", repo: "ChmaraX/herdr-gitview", latestCommit: "a".repeat(40), outdated: false },
      { id: "chmarax.herdr-nvim", repo: "ChmaraX/herdr-nvim", latestCommit: "b".repeat(40), outdated: false },
    ],
    missingBindings: [],
    integrations: [],
    nvimFound: true,
    nvimVersion: "0.12.4",
    nvimSupported: true,
    nvimManagedByBrew: true,
    nvimModuleAvailable: true,
    nvimConfigured: true,
    notes: [],
    ...overrides,
  };
}

test("offers pinned plugin installs only when a verified commit exists", () => {
  const actions = availableActions(audit());
  assert.equal(actions.length, 2);
  assert.match(actions[0].label, /@ a{12}$/);

  const noCommit = audit({ plugins: [{ id: "chmarax.gitview", repo: "ChmaraX/herdr-gitview", outdated: false }] });
  assert.equal(availableActions(noCommit).some((action) => action.id.startsWith("install-plugin:")), false);
});

test("does not offer a Homebrew Neovim upgrade for a non-Homebrew binary", () => {
  const actions = availableActions(audit({ nvimVersion: "0.9.0", nvimSupported: false, nvimManagedByBrew: false }));
  assert.equal(actions.some((action) => action.id === "update-nvim"), false);
});

test("offers only outdated integrations, not unrelated absent integrations", () => {
  const actions = availableActions(audit({ integrations: [
    { name: "pi", state: "outdated (v3 < v6)" },
    { name: "copilot", state: "not installed" },
  ] }));
  assert.equal(actions.some((action) => action.id === "integration:pi"), true);
  assert.equal(actions.some((action) => action.id === "integration:copilot"), false);
});

test("does not offer a Neovim bridge that would duplicate daemon setup", () => {
  const actions = availableActions(audit({ nvimConfigured: false }));
  assert.equal(actions.some((action) => action.id === "configure-nvim"), false);
});
