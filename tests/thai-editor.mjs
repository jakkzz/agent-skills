import assert from "node:assert/strict";
import thaiEditorExtension, { buildThaiAgentRequest } from "../extensions/thai-editor.ts";

const prompt = buildThaiAgentRequest("ตรวจภาษาไทยใน diff นี้");
assert.match(prompt, /thai-contextual-editor/);
assert.match(prompt, /thai-guide\/README\.md/);
assert.match(prompt, /Do not scan or rewrite the whole repository/);
assert.match(prompt, /ตรวจภาษาไทยใน diff นี้/);

let command;
let inputHandler;
const sent = [];
thaiEditorExtension({
  registerCommand(name, definition) {
    command = { name, ...definition };
  },
  on(event, handler) {
    if (event === "input") inputHandler = handler;
  },
  sendUserMessage(message) {
    sent.push(message);
  },
});

assert.equal(command.name, "thai");
assert.equal(command.getArgumentCompletions, undefined);
assert.equal(typeof inputHandler, "function");
assert.deepEqual(inputHandler({ text: "hello" }), { action: "continue" });

await command.handler("ปรับหน้า attendance ให้สั้นลง", {
  hasUI: true,
  ui: { notify() {}, async editor() { throw new Error("editor should not open when args exist"); } },
});
assert.equal(sent.length, 1);
assert.match(sent[0], /ปรับหน้า attendance ให้สั้นลง/);

await command.handler("", {
  hasUI: true,
  ui: { notify() {}, async editor() { return "เขียนข้อความแจ้งเตือนใหม่"; } },
});
assert.equal(sent.length, 2);
assert.match(sent[1], /เขียนข้อความแจ้งเตือนใหม่/);

const transformed = inputHandler({ text: "/skill:thai-contextual-editor ตรวจคำในหน้านี้" });
assert.equal(transformed.action, "transform");
assert.match(transformed.text, /ตรวจคำในหน้านี้/);
assert.deepEqual(
  inputHandler({ text: "/skill:thai-contextual-editor" }),
  { action: "continue" },
);

console.log("thai editor tests passed");
