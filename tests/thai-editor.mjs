import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import thaiEditorExtension, { completeThaiModel, thaiResponseText } from "../extensions/thai-editor.ts";
import {
  buildThaiPrompt,
  loadProfile,
  normalizeProfile,
  parseThaiProposals,
  saveProfile,
  terminologyViolations,
  thaiProfilePath,
} from "../lib/thai-editor-core.ts";
import {
  applyThaiReplacements,
  buildThaiBatchPrompt,
  createThaiBatches,
  extractThaiOccurrences,
  groupThaiOccurrences,
  isScannableTextPath,
  parseThaiBatchResponse,
  pathMatchesThaiScope,
  protectedTokenViolations,
  writeFilesAtomically,
} from "../lib/thai-repository-core.ts";

const profile = normalizeProfile({
  terms: [{ avoid: " ภาคส่วน ", use: " sector " }, { avoid: "", use: "ignored" }],
  examples: [
    { task: "polish", original: "ทางเรา", final: "เรา", createdAt: "2026-01-01T00:00:00.000Z" },
    { task: "invalid", original: "x", final: "y", createdAt: "now" },
  ],
});
assert.deepEqual(profile.terms, [{ avoid: "ภาคส่วน", use: "sector" }]);
assert.equal(profile.examples.length, 1);

const prompt = buildThaiPrompt("translate", "The public sector", "technical readers", profile);
assert.match(prompt, /The public sector/);
assert.match(prompt, /ภาคส่วน/);
assert.match(prompt, /sector/);
assert.match(prompt, /exactly three/);

const proposals = parseThaiProposals(`\n\`\`\`json\n{
  "options": [
    {"label":"Faithful","text":"หนึ่ง"},
    {"label":"Natural Thai","text":"สอง"},
    {"label":"Freer rewrite","text":"สาม"}
  ]
}\n\`\`\``);
assert.deepEqual(proposals.map((item) => item.text), ["หนึ่ง", "สอง", "สาม"]);
assert.deepEqual(
  terminologyViolations([{ label: "Natural", text: "ทุกภาคส่วน" }], "public ภาคส่วน", profile.terms),
  ["proposal 1 still uses “ภาคส่วน”", "proposal 1 does not use “sector”"],
);
assert.deepEqual(
  terminologyViolations([{ label: "Natural", text: "ทุก sector" }], "public ภาคส่วน", profile.terms),
  [],
);
assert.throws(() => parseThaiProposals('{"options":[]}'), /exactly three/);

const assistantResponse = {
  role: "assistant",
  content: [{ type: "text", text: '{"options":[]}' }],
  stopReason: "stop",
};
let providerCall;
const keylessContext = {
  model: { provider: "custom-provider", id: "custom-model", baseUrl: "http://default" },
  modelRegistry: {
    getProvider(provider) {
      assert.equal(provider, "custom-provider");
      return {
        streamSimple(model, context, options) {
          providerCall = { model, context, options };
          return { async result() { return assistantResponse; } };
        },
      };
    },
    async getProviderAuth() {
      return { auth: { baseUrl: "http://ambient" }, env: { AMBIENT_AUTH: "1" } };
    },
    async getApiKeyAndHeaders() {
      return { ok: true, headers: { "x-custom": "yes" }, env: { AMBIENT_AUTH: "1" } };
    },
  },
};
assert.equal(await completeThaiModel(keylessContext, { role: "user", content: "test", timestamp: 1 }), assistantResponse);
assert.equal(providerCall.model.baseUrl, "http://ambient");
assert.equal(providerCall.options.apiKey, undefined);
assert.equal(providerCall.options.env.AMBIENT_AUTH, "1");
assert.equal(providerCall.options.headers["x-custom"], "yes");
assert.equal(thaiResponseText(assistantResponse), '{"options":[]}');
assert.equal(thaiResponseText({ ...assistantResponse, stopReason: "aborted" }), null);
assert.throws(() => thaiResponseText({ ...assistantResponse, stopReason: "error", errorMessage: "provider failed" }), /provider failed/);
assert.throws(() => thaiResponseText({ ...assistantResponse, stopReason: "length" }), /truncated/);
assert.throws(() => thaiResponseText({ ...assistantResponse, stopReason: "toolUse" }), /unexpected tool call/);

process.env.THAI_EDITOR_PROFILE = "/tmp/test-thai-profile.json";
assert.equal(thaiProfilePath(), "/tmp/test-thai-profile.json");
delete process.env.THAI_EDITOR_PROFILE;

const temp = await mkdtemp(join(tmpdir(), "thai-editor-test-"));
const savedPath = join(temp, "nested", "profile.json");
await saveProfile(profile, savedPath);
assert.deepEqual(await loadProfile(savedPath), profile);
assert.equal((await stat(savedPath)).mode & 0o777, 0o600);
await rm(temp, { recursive: true, force: true });

const sampleSource = `export const label = "กรุณาทำการบันทึก {count} รายการ";\n# หมายเหตุสำหรับผู้ดูแล\nconst other = 'ข้อมูล';\nconst view = <p>ข้อความหน้าเว็บ</p>;\n`;
const occurrences = extractThaiOccurrences("app/example.ts", sampleSource);
assert.deepEqual(
  occurrences.map((item) => item.text),
  ["กรุณาทำการบันทึก {count} รายการ", "หมายเหตุสำหรับผู้ดูแล", "ข้อมูล", "ข้อความหน้าเว็บ"],
);
const groups = groupThaiOccurrences(occurrences);
assert.equal(groups.length, 4);
assert.equal(pathMatchesThaiScope("app/example.ts", "frontend"), true);
assert.equal(pathMatchesThaiScope("api_lib/example.py", "backend"), true);
assert.equal(pathMatchesThaiScope("app/messages/th.json", "hardcode"), false);
assert.equal(pathMatchesThaiScope("app/example.ts", "hardcode"), true);
assert.equal(isScannableTextPath("node_modules/pkg/th.json"), false);
assert.deepEqual(protectedTokenViolations("บันทึก {count} รายการ", "บันทึก {count} รายการแล้ว"), []);
assert.match(protectedTokenViolations("บันทึก {count} รายการ", "บันทึกรายการ")[0], /protected tokens changed/);

const first = groups[0];
const rewritten = applyThaiReplacements(
  sampleSource,
  [first.occurrences[0]],
  new Map([[first.occurrences[0].id, "บันทึก {count} รายการ"]]),
);
assert.match(rewritten, /"บันทึก \{count\} รายการ"/);
const batches = createThaiBatches(groups, 2, 10_000);
assert.deepEqual(batches.map((batch) => batch.length), [2, 2]);
const batchPrompt = buildThaiBatchPrompt(
  [{ id: first.id, text: first.text, context: "app/example.ts:1" }],
  "repo",
  profile,
);
assert.match(batchPrompt, /approvedExamples/);
assert.deepEqual(
  parseThaiBatchResponse(`{"items":[{"id":"${first.id}","text":"บันทึก {count} รายการ"}]}`, [first.id]),
  [{ groupId: first.id, text: "บันทึก {count} รายการ" }],
);
assert.throws(() => parseThaiBatchResponse('{"items":[]}', [first.id]), /ids do not match/);

const writeRoot = await mkdtemp(join(tmpdir(), "thai-repo-write-test-"));
await writeFile(join(writeRoot, "copy.ts"), sampleSource, { mode: 0o640 });
await writeFilesAtomically(writeRoot, new Map([["copy.ts", rewritten]]));
assert.equal(await readFile(join(writeRoot, "copy.ts"), "utf8"), rewritten);
assert.equal((await stat(join(writeRoot, "copy.ts"))).mode & 0o777, 0o640);
await rm(writeRoot, { recursive: true, force: true });

let command;
let inputHandler;
thaiEditorExtension({
  registerCommand(name, definition) {
    command = { name, ...definition };
  },
  on(event, handler) {
    if (event === "input") inputHandler = handler;
  },
  async exec(program, args, options = {}) {
    try {
      return {
        code: 0,
        stdout: execFileSync(program, args, { cwd: options.cwd, encoding: "utf8" }),
        stderr: "",
      };
    } catch (error) {
      return {
        code: error.status ?? 1,
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? error.message ?? error),
      };
    }
  },
});
assert.equal(command.name, "thai");
assert.equal(typeof inputHandler, "function");
assert.deepEqual(await inputHandler({ text: "hello" }, {}), { action: "continue" });
assert.ok(command.getArgumentCompletions("tr").some((item) => item.value === "translate"));
assert.ok(command.getArgumentCompletions("te").some((item) => item.value === "terms"));

const workflowRoot = await mkdtemp(join(tmpdir(), "thai-workflow-test-"));
execFileSync("git", ["init", "-q"], { cwd: workflowRoot });
execFileSync("git", ["config", "user.name", "Test"], { cwd: workflowRoot });
execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: workflowRoot });
await writeFile(join(workflowRoot, "copy.ts"), 'export const copy = "ข้อความภาษาไทย";\n');
execFileSync("git", ["add", "copy.ts"], { cwd: workflowRoot });
execFileSync("git", ["commit", "-qm", "fixture"], { cwd: workflowRoot });
const workflowNotifications = [];
let workflowDialog = 0;
await command.handler("", {
  cwd: workflowRoot,
  mode: "tui",
  ui: {
    async custom() {
      workflowDialog++;
      return workflowDialog === 1 ? "repo" : null;
    },
    notify(message, level) {
      workflowNotifications.push({ message, level });
    },
    setStatus() {},
  },
});
assert.match(workflowNotifications[0].message, /Found 1 Thai occurrence/);
await rm(workflowRoot, { recursive: true, force: true });

console.log("thai editor tests passed");
