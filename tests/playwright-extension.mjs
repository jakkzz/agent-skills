import assert from "node:assert/strict";
import playwrightExtension from "../extensions/playwright.ts";

const tools = new Map();
const handlers = new Map();

playwrightExtension({
  registerTool(definition) {
    tools.set(definition.name, definition);
  },
  on(event, handler) {
    handlers.set(event, handler);
  },
});

const expected = [
  "browser_display_status",
  "browser_open",
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_fill",
  "browser_press",
  "browser_wait",
  "browser_screenshot",
  "browser_console",
  "browser_close",
];

assert.deepEqual([...tools.keys()], expected);
assert.equal(typeof handlers.get("session_shutdown"), "function");
assert.match(tools.get("browser_display_status").description, /Herdr-managed panes/);
assert.match(tools.get("browser_open").description, /headless or headed/);
assert.match(tools.get("browser_snapshot").description, /accessibility snapshot/);
assert.match(tools.get("browser_fill").description, /not echoed/);
assert.match(tools.get("browser_screenshot").description, /PNG/);

const displayResult = await tools.get("browser_display_status").execute();
assert.match(displayResult.content[0].text, /Headed available:/);
assert.equal(typeof displayResult.details.platform, "string");
assert.equal(typeof displayResult.details.herdr, "boolean");

await handlers.get("session_shutdown")();
console.log("playwright extension tests passed");
