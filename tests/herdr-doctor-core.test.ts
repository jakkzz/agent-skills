import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMissingBindings,
  compareVersions,
  formatServerStatus,
  missingBindingCommands,
  parseIntegrationStatus,
  parsePluginRegistry,
} from "../lib/herdr-doctor-core.ts";

test("compares semantic versions", () => {
  assert.equal(compareVersions("0.7.5", "0.7.5"), 0);
  assert.equal(compareVersions("0.7.4", "0.7.5"), -1);
  assert.equal(compareVersions("NVIM v0.12.4", "0.10.0"), 2);
});

test("parses malformed and valid plugin registries safely", () => {
  assert.deepEqual(parsePluginRegistry("not json"), []);
  assert.equal(parsePluginRegistry('[{"plugin_id":"chmarax.gitview"}]')[0].plugin_id, "chmarax.gitview");
  assert.deepEqual(parsePluginRegistry('[null,42,{"plugin_id":false}]'), []);
});

test("appends only missing Herdr keybindings and remains idempotent", () => {
  const initial = '[[keys.command]]\nkey = "cmd+g"\ntype = "plugin_action"\ncommand = "chmarax.gitview.toggle"\n';
  assert.equal(missingBindingCommands(initial).length, 2);
  const configured = appendMissingBindings(initial);
  assert.equal(missingBindingCommands(configured).length, 0);
  assert.equal(appendMissingBindings(configured), configured);
  assert.equal((configured.match(/chmarax\.gitview\.toggle/g) ?? []).length, 1);

  const falsePositives = `# command = "chmarax.gitview.toggle"\n[[keys.command]]\nkey = "cmd+x"\ntype = "other"\ncommand = "chmarax.herdr-nvim.toggle"\n`;
  assert.equal(missingBindingCommands(falsePositives).length, 3);
});

test("parses integration status", () => {
  assert.deepEqual(parseIntegrationStatus("pi: outdated (v3 < v6) (/Users/test/hook.ts)\nclaude: current (v7)"), [
    { name: "pi", state: "outdated (v3 < v6)" },
    { name: "claude", state: "current (v7)" },
  ]);
});

test("formats JSON server status", () => {
  assert.equal(formatServerStatus('{"status":"running","version":"0.7.5","compatible":true}'), "running v0.7.5");
  assert.equal(formatServerStatus("not running"), "not running");
});
