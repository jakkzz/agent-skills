import type { UserMessage } from "@earendil-works/pi-ai";
import { BorderedLoader, DynamicBorder, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadProfile,
  saveProfile,
  terminologyViolations,
  type Proposal,
  type ThaiProfile,
} from "./thai-editor-core.ts";
import { completeThaiModel, thaiResponseText } from "./thai-model.ts";
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
  type ThaiOccurrence,
  type ThaiScope,
  type ThaiTextGroup,
} from "./thai-repository-core.ts";

export interface ThaiRepositoryWorkflowDependencies {
  chooseProposal(
    original: string,
    proposals: Proposal[],
    profile: ThaiProfile,
    ctx: ExtensionContext,
  ): Promise<number | null>;
  generateProposals(
    source: string,
    context: string,
    profile: ThaiProfile,
    ctx: ExtensionContext,
  ): Promise<Proposal[] | null>;
}

interface ScanResult {
  root: string;
  groups: ThaiTextGroup[];
  occurrences: ThaiOccurrence[];
  fileContents: Map<string, string>;
}

const SCOPE_LABELS: Record<ThaiScope, string> = {
  repo: "Repo — Thai text in every Git-visible text file",
  backend: "Backend — Thai text in backend/server source files",
  frontend: "Frontend — Thai text under app, frontend, web, client, or UI roots",
  hardcode: "Hardcode — inline Thai in source code outside localization catalogs",
};

function preview(text: string, max = 130): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

async function selectWithDescriptions(
  title: string,
  items: SelectItem[],
  visibleRows: number,
  ctx: ExtensionContext,
): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
    const list = new SelectList(items, Math.min(Math.max(1, items.length), visibleRows), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(null);
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • Enter select • Esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

async function chooseScope(ctx: ExtensionContext): Promise<ThaiScope | null> {
  const value = await selectWithDescriptions(
    "Choose Thai review scope",
    (Object.entries(SCOPE_LABELS) as Array<[ThaiScope, string]>).map(([scope, label]) => ({
      value: scope,
      label: label.split(" — ")[0],
      description: label.split(" — ")[1],
    })),
    6,
    ctx,
  );
  return value as ThaiScope | null;
}

async function gitRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
  const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 15_000 });
  if (result.code !== 0) throw new Error("/thai repository workflow requires a Git repository");
  return result.stdout.trim();
}

async function requireCleanRepository(pi: ExtensionAPI, root: string): Promise<void> {
  const result = await pi.exec("git", ["status", "--porcelain"], { cwd: root, timeout: 15_000 });
  if (result.code !== 0) throw new Error(result.stderr.trim() || "Unable to inspect repository status");
  if (result.stdout.trim()) {
    throw new Error("The repository must be clean before /thai can apply and commit a bounded set of files");
  }
}

async function scanRepository(pi: ExtensionAPI, root: string, scope: ThaiScope, ctx: ExtensionContext): Promise<ScanResult> {
  const listed = await pi.exec("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, timeout: 30_000 });
  if (listed.code !== 0) throw new Error(listed.stderr.trim() || "Unable to list repository files");
  const paths = listed.stdout.split("\0").filter(Boolean);
  const occurrences: ThaiOccurrence[] = [];
  const fileContents = new Map<string, string>();
  let inspected = 0;

  ctx.ui.setStatus("thai-editor", `Scanning ${scope}…`);
  for (const path of paths) {
    if (!isScannableTextPath(path) || !pathMatchesThaiScope(path, scope)) continue;
    inspected++;
    if (inspected % 100 === 0) ctx.ui.setStatus("thai-editor", `Scanning ${scope} · ${inspected} files`);
    const absolute = resolve(root, path);
    let bytes: Buffer;
    try {
      const metadata = await lstat(absolute);
      if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
      bytes = await readFile(absolute);
    } catch {
      continue;
    }
    if (bytes.length > 2_000_000 || bytes.includes(0)) continue;
    const content = bytes.toString("utf8");
    if (content.includes("\uFFFD")) continue;
    const found = extractThaiOccurrences(path, content);
    if (found.length === 0) continue;
    fileContents.set(path, content);
    occurrences.push(...found);
  }
  ctx.ui.setStatus("thai-editor", undefined);
  return { root, groups: groupThaiOccurrences(occurrences), occurrences, fileContents };
}

function groupLocationSummary(group: ThaiTextGroup, limit = 5): string {
  const locations = group.occurrences.slice(0, limit).map((item) => `${item.path}:${item.line}`).join(", ");
  const extra = group.occurrences.length > limit ? ` and ${group.occurrences.length - limit} more` : "";
  return `${locations}${extra}`;
}

function groupContext(group: ThaiTextGroup, scope: ThaiScope): string {
  return `Repository ${scope} copy at ${groupLocationSummary(group)}. Preserve code syntax and placeholders.`;
}

function proposalViolations(group: ThaiTextGroup, proposed: string, profile: ThaiProfile): string[] {
  return [
    ...(proposed.includes("\n") || proposed.includes("\r") ? ["proposed text must remain on one source line"] : []),
    ...terminologyViolations([{ label: "Proposed", text: proposed }], group.text, profile.terms),
    ...protectedTokenViolations(group.text, proposed),
  ];
}

async function editSelectedProposal(
  group: ThaiTextGroup,
  initial: string,
  profile: ThaiProfile,
  ctx: ExtensionContext,
): Promise<string | null> {
  let current = initial;
  while (true) {
    const edited = await ctx.ui.editor("Final Thai — edit or submit", current);
    if (edited === undefined) return null;
    current = edited.trim();
    if (!current) return null;
    const violations = proposalViolations(group, current, profile);
    if (violations.length === 0) return current;
    ctx.ui.notify(`Cannot accept: ${violations.join("; ")}`, "warning");
  }
}

async function calibrateGroup(
  group: ThaiTextGroup,
  scope: ThaiScope,
  profile: ThaiProfile,
  dependencies: ThaiRepositoryWorkflowDependencies,
  ctx: ExtensionContext,
): Promise<string | null> {
  const proposals = await dependencies.generateProposals(group.text, groupContext(group, scope), profile, ctx);
  if (!proposals) return null;
  const selected = await dependencies.chooseProposal(group.text, proposals, profile, ctx);
  if (selected === null) return null;
  const seed = selected < proposals.length ? proposals[selected].text : "";
  return editSelectedProposal(group, seed, profile, ctx);
}

async function chooseTextAction(
  groups: ThaiTextGroup[],
  selected: ReadonlyMap<string, string>,
  ctx: ExtensionContext,
): Promise<string | null> {
  const items: SelectItem[] = [
    {
      value: "__polish_remaining__",
      label: `Polish all remaining texts (${groups.length - selected.size})`,
      description: "Uses approved choices as prompt examples; asks before the exact bounded model-call count.",
    },
    {
      value: "__review__",
      label: `Review proposed changes (${selected.size})`,
      description: "Inspect, edit, regenerate, or remove individual changes before files are written.",
    },
    ...groups.map((group) => {
      const location = group.occurrences[0];
      return {
        value: group.id,
        label: `${selected.has(group.id) ? "✓" : "○"} ${location.path}:${location.line}${group.occurrences.length > 1 ? ` ×${group.occurrences.length}` : ""}`,
        description: `${preview(selected.get(group.id) ?? group.text, 90)} · ${groupLocationSummary(group, 3)}`,
      };
    }),
  ];
  return selectWithDescriptions(`Thai text inventory · ${groups.length} unique texts`, items, 18, ctx);
}

async function generateBatch(
  batch: ThaiTextGroup[],
  scope: ThaiScope,
  profile: ThaiProfile,
  batchNumber: number,
  batchCount: number,
  ctx: ExtensionContext,
): Promise<Map<string, string> | null> {
  if (!ctx.model) throw new Error("No model selected");
  return ctx.ui.custom<Map<string, string> | null>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(
      tui,
      theme,
      `Polishing Thai batch ${batchNumber}/${batchCount} with ${ctx.model!.id}…`,
    );
    loader.onAbort = () => done(null);

    const run = async () => {
      let correction = "";
      const items = batch.map((group) => ({ id: group.id, text: group.text, context: groupContext(group, scope) }));
      for (let attempt = 0; attempt < 2; attempt++) {
        const message: UserMessage = {
          role: "user",
          content: [{ type: "text", text: `${buildThaiBatchPrompt(items, scope, profile)}${correction}` }],
          timestamp: Date.now(),
        };
        const response = await completeThaiModel(ctx, message, loader.signal);
        const raw = thaiResponseText(response);
        if (raw === null) return null;
        const replacements = parseThaiBatchResponse(raw, batch.map((group) => group.id));
        const byId = new Map(replacements.map((item) => [item.groupId, item.text]));
        const violations = batch.flatMap((group) =>
          proposalViolations(group, byId.get(group.id) ?? "", profile).map((violation) => `${group.id}: ${violation}`),
        );
        if (violations.length === 0) return byId;
        correction = `\nYour previous response failed validation: ${violations.join("; ")}. Regenerate the complete batch.`;
      }
      throw new Error("The model could not preserve required terminology and protected tokens");
    };

    run().then(done).catch((error) => {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      done(null);
    });
    return loader;
  });
}

async function polishRemaining(
  groups: ThaiTextGroup[],
  selected: Map<string, string>,
  scope: ThaiScope,
  profile: ThaiProfile,
  ctx: ExtensionContext,
): Promise<boolean> {
  const remaining = groups.filter((group) => !selected.has(group.id));
  if (remaining.length === 0) {
    ctx.ui.notify("Every discovered Thai text already has a proposed change", "info");
    return true;
  }
  const batches = createThaiBatches(remaining);
  const maximumCalls = batches.length * 2;
  if (maximumCalls > 150) {
    ctx.ui.notify(
      `This scope may need up to ${maximumCalls} model calls, above the 150-call safety limit. Choose a narrower scope or approve representative examples first.`,
      "warning",
    );
    return false;
  }
  const confirmed = await ctx.ui.confirm(
    "Polish all remaining Thai text?",
    `${remaining.length} unique texts in ${batches.length} batch(es), with up to ${maximumCalls} model calls including one validation retry per batch. No files are written until review is approved.`,
  );
  if (!confirmed) return false;

  for (let index = 0; index < batches.length; index++) {
    const result = await generateBatch(batches[index], scope, profile, index + 1, batches.length, ctx);
    if (!result) return false;
    for (const [id, text] of result) selected.set(id, text);
  }
  return true;
}

async function reviewChanges(
  groups: ThaiTextGroup[],
  selected: Map<string, string>,
  scope: ThaiScope,
  profile: ThaiProfile,
  dependencies: ThaiRepositoryWorkflowDependencies,
  ctx: ExtensionContext,
): Promise<boolean> {
  while (true) {
    const changed = groups.filter((group) => {
      const value = selected.get(group.id);
      return value !== undefined && value !== group.text;
    });
    if (changed.length === 0) {
      ctx.ui.notify("No changed Thai text is selected", "warning");
      return false;
    }
    const action = await selectWithDescriptions(
      `Review Thai changes · ${changed.length} changed texts`,
      [
        {
          value: "__apply__",
          label: `Apply ${changed.length} reviewed changes`,
          description: "Writes only the listed repository files, then runs Git validation before commit.",
        },
        ...changed.map((group) => {
          const first = group.occurrences[0];
          return {
            value: group.id,
            label: `${first.path}:${first.line}${group.occurrences.length > 1 ? ` ×${group.occurrences.length}` : ""}`,
            description: `${preview(group.text, 60)} → ${preview(selected.get(group.id) ?? "", 60)}`,
          };
        }),
      ],
      18,
      ctx,
    );
    if (!action) return false;
    if (action === "__apply__") return true;
    const group = groups.find((item) => item.id === action);
    if (!group) continue;
    const decision = await ctx.ui.select("Review selected Thai change", [
      "View/edit proposed text",
      "Generate three new alternatives",
      "Remove this change",
      "Keep unchanged",
    ]);
    if (!decision || decision === "Keep unchanged") continue;
    if (decision === "Remove this change") {
      selected.delete(group.id);
      continue;
    }
    if (decision === "View/edit proposed text") {
      const edited = await editSelectedProposal(group, selected.get(group.id) ?? group.text, profile, ctx);
      if (edited) selected.set(group.id, edited);
      continue;
    }
    const calibrated = await calibrateGroup(group, scope, profile, dependencies, ctx);
    if (calibrated) selected.set(group.id, calibrated);
  }
}

function changedFileContents(scan: ScanResult, selected: ReadonlyMap<string, string>): Map<string, string> {
  const groupById = new Map(scan.groups.map((group) => [group.id, group]));
  const occurrenceReplacements = new Map<string, string>();
  for (const [groupId, text] of selected) {
    const group = groupById.get(groupId);
    if (!group || text === group.text) continue;
    group.occurrences.forEach((occurrence) => occurrenceReplacements.set(occurrence.id, text));
  }
  const byPath = new Map<string, ThaiOccurrence[]>();
  for (const occurrence of scan.occurrences) {
    if (!occurrenceReplacements.has(occurrence.id)) continue;
    const values = byPath.get(occurrence.path) ?? [];
    values.push(occurrence);
    byPath.set(occurrence.path, values);
  }
  const contents = new Map<string, string>();
  for (const [path, occurrences] of byPath) {
    const original = scan.fileContents.get(path);
    if (original === undefined) continue;
    const updated = applyThaiReplacements(original, occurrences, occurrenceReplacements);
    if (updated !== original) contents.set(path, updated);
  }
  return contents;
}

async function verifyFilesUnchanged(scan: ScanResult): Promise<void> {
  for (const [path, expected] of scan.fileContents) {
    const current = await readFile(resolve(scan.root, path), "utf8");
    if (current !== expected) throw new Error(`File changed after scanning; restart /thai: ${path}`);
  }
}

async function runOptionalTests(pi: ExtensionAPI, root: string, ctx: ExtensionContext): Promise<boolean> {
  const command = (await ctx.ui.input("Test command before commit (optional)", "e.g. npm test or uv run pytest -q"))?.trim();
  if (!command) return true;
  ctx.ui.setStatus("thai-editor", "Running review tests…");
  const result = await pi.exec("bash", ["-lc", command], { cwd: root, timeout: 1_200_000 });
  ctx.ui.setStatus("thai-editor", undefined);
  if (result.code === 0) {
    ctx.ui.notify("Review tests passed", "info");
    return true;
  }
  ctx.ui.notify(`Review tests failed; changes were not committed\n${preview(result.stderr || result.stdout, 500)}`, "error");
  return false;
}

async function verifyBoundedChanges(
  pi: ExtensionAPI,
  root: string,
  expectedContents: ReadonlyMap<string, string>,
): Promise<void> {
  const changed = await pi.exec("git", ["diff", "--name-only", "-z"], { cwd: root, timeout: 30_000 });
  const untracked = await pi.exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, timeout: 30_000 });
  if (changed.code !== 0 || untracked.code !== 0) throw new Error("Unable to verify bounded Git changes");
  const actualPaths = [...changed.stdout.split("\0"), ...untracked.stdout.split("\0")].filter(Boolean);
  const unexpected = actualPaths.filter((path) => !expectedContents.has(path));
  if (unexpected.length > 0) {
    throw new Error(`Tests or another process changed files outside the approved Thai scope: ${unexpected.join(", ")}`);
  }
  for (const [path, expected] of expectedContents) {
    if (await readFile(resolve(root, path), "utf8") !== expected) {
      throw new Error(`File changed after review or during tests; inspect before committing: ${path}`);
    }
  }
}

async function commitChanges(
  pi: ExtensionAPI,
  root: string,
  paths: string[],
  ctx: ExtensionContext,
): Promise<void> {
  const shouldCommit = await ctx.ui.confirm("Commit reviewed Thai changes?", `${paths.length} file(s) will be staged and committed. Nothing will be pushed.`);
  if (!shouldCommit) {
    ctx.ui.notify("Thai changes remain uncommitted for manual review", "info");
    return;
  }
  const message = (await ctx.ui.input("Commit message", "Polish Thai copy"))?.trim() || "Polish Thai copy";
  if (message.includes("\n") || message.length > 200) throw new Error("Commit message must be one line and at most 200 characters");
  const added = await pi.exec("git", ["add", "--", ...paths], { cwd: root, timeout: 30_000 });
  if (added.code !== 0) throw new Error(added.stderr.trim() || "Unable to stage Thai changes");
  const committed = await pi.exec("git", ["commit", "-m", message, "--", ...paths], { cwd: root, timeout: 120_000 });
  if (committed.code !== 0) throw new Error(committed.stderr.trim() || committed.stdout.trim() || "Git commit failed");
  ctx.ui.notify(committed.stdout.trim().split("\n")[0] || "Thai changes committed", "info");
}

export async function runThaiRepositoryWorkflow(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  dependencies: ThaiRepositoryWorkflowDependencies,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/thai repository workflow requires interactive mode", "error");
    return;
  }
  const scope = await chooseScope(ctx);
  if (!scope) return;
  const root = await gitRoot(pi, ctx.cwd);
  await requireCleanRepository(pi, root);
  const scan = await scanRepository(pi, root, scope, ctx);
  if (scan.groups.length === 0) {
    ctx.ui.notify(`No Thai text found in the selected ${scope} scope`, "info");
    return;
  }

  ctx.ui.notify(
    `Found ${scan.occurrences.length} Thai occurrence(s), ${scan.groups.length} unique text(s), in ${scan.fileContents.size} file(s)`,
    "info",
  );
  const persistedProfile = await loadProfile();
  const workingProfile: ThaiProfile = {
    ...persistedProfile,
    terms: [...persistedProfile.terms],
    examples: [...persistedProfile.examples],
  };
  const selected = new Map<string, string>();
  const newExampleIds = new Set<string>();

  while (true) {
    const action = await chooseTextAction(scan.groups, selected, ctx);
    if (!action) return;
    if (action === "__review__") break;
    if (action === "__polish_remaining__") {
      if (await polishRemaining(scan.groups, selected, scope, workingProfile, ctx)) break;
      continue;
    }
    const group = scan.groups.find((item) => item.id === action);
    if (!group) continue;
    const finalText = await calibrateGroup(group, scope, workingProfile, dependencies, ctx);
    if (!finalText) continue;
    selected.set(group.id, finalText);
    if (!newExampleIds.has(group.id)) {
      workingProfile.examples.push({
        task: "polish",
        original: group.text,
        final: finalText,
        context: groupContext(group, scope),
        createdAt: new Date().toISOString(),
      });
      workingProfile.examples = workingProfile.examples.slice(-30);
      newExampleIds.add(group.id);
    }
  }

  if (!(await reviewChanges(scan.groups, selected, scope, workingProfile, dependencies, ctx))) return;
  const contents = changedFileContents(scan, selected);
  if (contents.size === 0) {
    ctx.ui.notify("Review produced no file changes", "info");
    return;
  }
  const apply = await ctx.ui.confirm(
    "Apply reviewed Thai changes?",
    `${contents.size} file(s) will be written atomically. Git must still be clean and source files must match the scan.`,
  );
  if (!apply) return;

  await requireCleanRepository(pi, root);
  await verifyFilesUnchanged(scan);
  await writeFilesAtomically(root, contents);
  const diffCheck = await pi.exec("git", ["diff", "--check", "--", ...contents.keys()], { cwd: root, timeout: 30_000 });
  if (diffCheck.code !== 0) {
    const originals = new Map([...contents.keys()].map((path) => [path, scan.fileContents.get(path)!]));
    await writeFilesAtomically(root, originals);
    throw new Error(`Git diff validation failed; files were restored\n${diffCheck.stdout || diffCheck.stderr}`);
  }

  const saveExamples = newExampleIds.size > 0 && await ctx.ui.confirm(
    "Save selected choices as style examples?",
    `${newExampleIds.size} approved example(s) will guide later /thai proposals on this machine. Do not save sensitive text.`,
  );
  if (saveExamples) await saveProfile(workingProfile);
  if (!(await runOptionalTests(pi, root, ctx))) return;
  await verifyBoundedChanges(pi, root, contents);
  await commitChanges(pi, root, [...contents.keys()], ctx);
}
