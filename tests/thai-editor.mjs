import assert from "node:assert/strict";
import thaiEditorExtension, { thaiWorkflowInstructions } from "../extensions/thai-editor.ts";

const instructions = thaiWorkflowInstructions();
assert.match(instructions, /thai-contextual-editor/);
assert.match(instructions, /thai-guide\/README\.md/);
assert.match(instructions, /manual style calibration/);
assert.match(instructions, /record only the user-approved example under thai-guide\/examples/);
assert.match(instructions, /Do not edit product source during calibration/);
assert.match(instructions, /Do not scan or rewrite the whole repository/);

let command;
let inputHandler;
let beforeAgentStart;
const sent = [];
thaiEditorExtension({
  registerCommand(name, definition) {
    command = { name, ...definition };
  },
  on(event, handler) {
    if (event === "input") inputHandler = handler;
    if (event === "before_agent_start") beforeAgentStart = handler;
  },
  sendUserMessage(message) {
    sent.push(message);
  },
});

assert.equal(command.name, "thai");
assert.equal(command.getArgumentCompletions, undefined);
assert.equal(typeof inputHandler, "function");
assert.equal(typeof beforeAgentStart, "function");
assert.deepEqual(inputHandler({ text: "hello" }), { action: "continue" });

await command.handler("เริ่มสอน style จากหน้า attendance", {
  hasUI: true,
  ui: { notify() {}, async editor() { throw new Error("editor should not open when args exist"); } },
});
assert.deepEqual(sent, ["เริ่มสอน style จากหน้า attendance"]);
const injected = beforeAgentStart({ systemPrompt: "base prompt" });
assert.match(injected.systemPrompt, /^base prompt/);
assert.match(injected.systemPrompt, /thai-guide\/examples/);
assert.equal(beforeAgentStart({ systemPrompt: "next prompt" }), undefined);

await command.handler("", {
  hasUI: true,
  ui: { notify() {}, async editor() { return "ใช้ตัวอย่างกับหน้า attendance"; } },
});
assert.equal(sent[1], "ใช้ตัวอย่างกับหน้า attendance");
assert.match(beforeAgentStart({ systemPrompt: "base prompt" }).systemPrompt, /Apply approved examples/);

const transformed = inputHandler({ text: "/skill:thai-contextual-editor ตรวจคำในหน้านี้" });
assert.deepEqual(transformed, { action: "transform", text: "ตรวจคำในหน้านี้" });
assert.match(beforeAgentStart({ systemPrompt: "base prompt" }).systemPrompt, /manual style calibration/);
assert.deepEqual(
  inputHandler({ text: "/skill:thai-contextual-editor" }),
  { action: "continue" },
);

console.log("thai editor tests passed");
