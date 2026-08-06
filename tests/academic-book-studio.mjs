import assert from "node:assert/strict";
import academicBookStudio from "../extensions/academic-book-studio.ts";

async function startup(execResult) {
  let sessionStart;
  const statuses = [];
  const pi = {
    registerTool() {},
    registerCommand() {},
    on(event, handler) {
      if (event === "session_start") sessionStart = handler;
    },
    async exec() {
      return execResult;
    },
  };
  academicBookStudio(pi);
  assert.equal(typeof sessionStart, "function");
  await sessionStart({}, {
    cwd: "/workspace",
    hasUI: true,
    ui: {
      setStatus(name, value) {
        statuses.push({ name, value });
      },
      theme: {
        fg(_tone, value) {
          return value;
        },
      },
    },
  });
  return statuses;
}

const noBook = await startup({
  code: 2,
  stdout: '{"ok":false,"error":"No BOOK_STATE.yaml found from /workspace"}',
  stderr: "",
});
assert.deepEqual(noBook.at(-1), { name: "academic-book", value: undefined });

const brokenBook = await startup({
  code: 2,
  stdout: '{"ok":false,"error":"BOOK_STATE.yaml contains invalid YAML"}',
  stderr: "",
});
assert.deepEqual(brokenBook.at(-1), { name: "academic-book", value: "Book state error" });

const activeBook = await startup({
  code: 0,
  stdout: '{"ok":true,"result":{"chapter":"chapter-01","chapter_phase":"draft-v1","current_gate":"delegated-ready"}}',
  stderr: "",
});
assert.equal(activeBook.at(-1).value, "Book chapter-01 · draft-v1 →");

console.log("academic book studio status tests passed");
