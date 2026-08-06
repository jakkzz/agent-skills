import assert from "node:assert/strict";
import mySkillExtension from "../extensions/myskill.ts";

async function invoke(action, code) {
  let command;
  let reloads = 0;
  const notifications = [];
  const statuses = [];
  const pi = {
    registerCommand(name, definition) {
      command = { name, ...definition };
    },
    async exec() {
      return {
        code,
        stdout: code === 0 ? "already synchronized\nlinks=2/2\n" : "",
        stderr: code === 75 ? "partial: links failed\n" : "failed safely\n",
      };
    },
  };
  mySkillExtension(pi);
  assert.equal(command.name, "myskill");
  assert.ok(command.getArgumentCompletions("up").some((item) => item.value === "update"));

  const ctx = {
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
      setStatus(name, value) {
        statuses.push({ name, value });
      },
    },
    async reload() {
      reloads += 1;
    },
  };
  await command.handler(action, ctx);
  return { reloads, notifications, statuses };
}

const status = await invoke("status", 0);
assert.equal(status.reloads, 0);
assert.equal(status.statuses.at(-1).value, undefined);

const updated = await invoke("update", 0);
assert.equal(updated.reloads, 1);
assert.equal(updated.statuses.at(-1).value, undefined);

const partial = await invoke("update", 75);
assert.equal(partial.reloads, 1);
assert.equal(partial.notifications.at(-1).level, "warning");
assert.equal(partial.statuses.at(-1).value, undefined);

const failed = await invoke("update", 1);
assert.equal(failed.reloads, 0);
assert.equal(failed.notifications.at(-1).level, "error");
assert.equal(failed.statuses.at(-1).value, undefined);

console.log("myskill extension tests passed");
