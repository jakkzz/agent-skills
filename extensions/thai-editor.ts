import type { UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BorderedLoader, DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import {
  buildThaiPrompt,
  loadProfile,
  parseThaiProposals,
  saveProfile,
  terminologyViolations,
  thaiProfilePath,
  type Proposal,
  type ThaiProfile,
  type ThaiTask,
} from "../lib/thai-editor-core.ts";
import { completeThaiModel, thaiResponseText } from "../lib/thai-model.ts";
import { protectedTokenViolations } from "../lib/thai-repository-core.ts";
import { runThaiRepositoryWorkflow } from "../lib/thai-repository-workflow.ts";

export { completeThaiModel, thaiResponseText } from "../lib/thai-model.ts";

const TASK_LABELS: Record<ThaiTask, string> = {
  polish: "Polish Thai",
  translate: "Translate into Thai",
  write: "Write original Thai",
};

function truncatePreview(text: string, max = 500): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

async function chooseProposal(
  original: string,
  proposals: Proposal[],
  profile: ThaiProfile,
  ctx: ExtensionContext,
): Promise<number | null> {
  const terms = profile.terms;
  return ctx.ui.custom<number | null>((tui, theme, _keybindings, done) => {
    const choices: SelectItem[] = [
      ...proposals.map((proposal, index) => ({ value: String(index), label: `${index + 1}. ${proposal.label}` })),
      { value: "3", label: "4. Custom version" },
    ];
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    if (terms.length > 0) {
      container.addChild(new Text(theme.fg("accent", theme.bold("Terminology")), 1, 0));
      container.addChild(new Text(terms.map((rule) => `${rule.avoid} → ${rule.use}`).join(" • "), 2, 0));
    }
    container.addChild(new Text(theme.fg("accent", theme.bold("Original")), 1, 0));
    container.addChild(new Text(truncatePreview(original), 2, 1));
    proposals.forEach((proposal, index) => {
      container.addChild(new Text(theme.fg("accent", theme.bold(`${index + 1}. ${proposal.label}`)), 1, 0));
      container.addChild(new Text(truncatePreview(proposal.text), 2, 1));
    });
    container.addChild(new Text(theme.fg("accent", theme.bold("Choose a proposal or write your own")), 1, 0));
    const list = new SelectList(choices, 4, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    list.setSelectedIndex(1);
    list.onSelect = (item) => done(Number(item.value));
    list.onCancel = () => done(null);
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "Long previews are truncated; the selected text opens in full."), 1, 0));
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

async function generateProposals(
  task: ThaiTask,
  source: string,
  context: string,
  profile: ThaiProfile,
  ctx: ExtensionContext,
): Promise<Proposal[] | null> {
  if (!ctx.model) throw new Error("No model selected");
  return ctx.ui.custom<Proposal[] | null>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(tui, theme, `Creating Thai proposals with ${ctx.model!.id}…`);
    loader.onAbort = () => done(null);

    const run = async () => {
      let correction = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const message: UserMessage = {
          role: "user",
          content: [{ type: "text", text: `${buildThaiPrompt(task, source, context, profile)}${correction}` }],
          timestamp: Date.now(),
        };
        const response = await completeThaiModel(ctx, message, loader.signal);
        const text = thaiResponseText(response);
        if (text === null) return null;
        const proposals = parseThaiProposals(text);
        const violations = [
          ...terminologyViolations(proposals, source, profile.terms),
          ...proposals.flatMap((proposal, index) =>
            protectedTokenViolations(source, proposal.text).map((violation) => `proposal ${index + 1} ${violation}`),
          ),
        ];
        if (violations.length === 0) return proposals;
        correction = `\nYour previous response violated required terminology: ${violations.join("; ")}. Regenerate all three proposals correctly.`;
      }
      throw new Error("The model could not satisfy the required terminology rules");
    };

    run().then(done).catch((error) => {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      done(null);
    });
    return loader;
  });
}

function parseTaskArgs(args: string): { task?: ThaiTask; source: string; terms: boolean } {
  const trimmed = args.trim();
  if (!trimmed) return { source: "", terms: false };
  const separator = trimmed.search(/\s/);
  const command = separator < 0 ? trimmed : trimmed.slice(0, separator);
  const rest = separator < 0 ? "" : trimmed.slice(separator).trimStart();
  if (command === "terms") return { source: rest, terms: true };
  if ((["polish", "translate", "write"] as string[]).includes(command)) {
    return { task: command as ThaiTask, source: rest, terms: false };
  }
  return { source: trimmed, terms: false };
}

async function manageTerms(ctx: ExtensionContext): Promise<void> {
  const path = thaiProfilePath();
  const profile = await loadProfile(path);
  const action = await ctx.ui.select("Terminology rules", ["Add rule", "Remove rule", "View rules"]);
  if (!action) return;

  if (action === "View rules") {
    if (profile.terms.length === 0) {
      ctx.ui.notify("No terminology rules saved", "info");
      return;
    }
    await ctx.ui.select("Required terminology", profile.terms.map((rule) => `${rule.avoid} → ${rule.use}`));
    return;
  }

  if (action === "Remove rule") {
    if (profile.terms.length === 0) {
      ctx.ui.notify("No terminology rules saved", "info");
      return;
    }
    const labels = profile.terms.map((rule) => `${rule.avoid} → ${rule.use}`);
    const selected = await ctx.ui.select("Remove which rule?", labels);
    if (!selected) return;
    const index = labels.indexOf(selected);
    if (index < 0 || !(await ctx.ui.confirm("Remove terminology rule?", selected))) return;
    profile.terms.splice(index, 1);
    await saveProfile(profile, path);
    ctx.ui.notify("Terminology rule removed", "info");
    return;
  }

  const avoid = (await ctx.ui.input("Avoid this term", "ภาคส่วน"))?.trim();
  if (!avoid) return;
  const use = (await ctx.ui.input("Use instead", "sector"))?.trim();
  if (!use) return;
  if (use.includes(avoid)) {
    ctx.ui.notify("The replacement cannot contain the avoided term", "warning");
    return;
  }
  if (!(await ctx.ui.confirm("Save terminology rule?", `${avoid} → ${use}`))) return;
  const existing = profile.terms.findIndex((rule) => rule.avoid === avoid);
  if (existing >= 0) profile.terms[existing] = { avoid, use };
  else profile.terms.push({ avoid, use });
  await saveProfile(profile, path);
  ctx.ui.notify(`Terminology saved: ${avoid} → ${use}`, "info");
}

async function runThaiForm(args: string, pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/thai requires interactive mode", "error");
    return;
  }

  if (!args.trim()) {
    await runThaiRepositoryWorkflow(pi, ctx, {
      chooseProposal,
      generateProposals: (source, context, profile, workflowContext) =>
        generateProposals("polish", source, context, profile, workflowContext),
    });
    return;
  }

  const parsed = parseTaskArgs(args);
  if (parsed.terms) {
    await manageTerms(ctx);
    return;
  }

  let task = parsed.task;
  if (!task) {
    const selected = await ctx.ui.select("Thai writing task", Object.values(TASK_LABELS));
    if (!selected) return;
    task = (Object.entries(TASK_LABELS).find(([, label]) => label === selected)?.[0] ?? "polish") as ThaiTask;
  }

  const promptLabel = task === "write" ? "Enter the brief" : task === "translate" ? "Enter the source text" : "Enter the Thai text";
  const source = parsed.source || (await ctx.ui.editor(promptLabel, ""))?.trim();
  if (!source) return;
  if (source.length > 20_000) {
    ctx.ui.notify("Please review at most 20,000 characters at a time", "warning");
    return;
  }

  const context = (await ctx.ui.input("Context (optional)", "audience, channel, tone"))?.trim() ?? "";
  const profile = await loadProfile();
  const proposals = await generateProposals(task, source, context, profile, ctx);
  if (!proposals) {
    ctx.ui.notify("Thai writing cancelled", "info");
    return;
  }

  const selected = await chooseProposal(source, proposals, profile, ctx);
  if (selected === null) return;
  const seed = selected < proposals.length ? proposals[selected].text : "";
  let finalText = seed;
  while (true) {
    finalText = (await ctx.ui.editor("Final Thai — edit or submit", finalText))?.trim() ?? "";
    if (!finalText) return;
    const violations = [
      ...terminologyViolations([{ label: "Final", text: finalText }], source, profile.terms),
      ...protectedTokenViolations(source, finalText),
    ];
    if (violations.length === 0) break;
    ctx.ui.notify(`Required terminology needs correction: ${violations.join("; ")}`, "warning");
  }

  const save = await ctx.ui.confirm(
    "Save as a local style example?",
    "This stores the original and selected text locally on this machine. Do not save sensitive text.",
  );
  if (save) {
    profile.examples.push({ task, original: source, final: finalText, createdAt: new Date().toISOString() });
    profile.examples = profile.examples.slice(-30);
    await saveProfile(profile);
  }

  ctx.ui.setEditorText(finalText);
  ctx.ui.notify("Selected Thai text loaded into the editor", "info");
}

export default function thaiEditorExtension(pi: ExtensionAPI) {
  pi.registerCommand("thai", {
    description: "Review and polish Thai across a repository, or polish, translate, and write individual text",
    getArgumentCompletions: (prefix) => {
      const actions = ["polish", "translate", "write", "terms"];
      const matches = actions.filter((action) => action.startsWith(prefix.trim()));
      return matches.length ? matches.map((action) => ({ value: action, label: action })) : null;
    },
    handler: async (args, ctx) => {
      try {
        await runThaiForm(args, pi, ctx);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      } finally {
        ctx.ui.setStatus("thai-editor", undefined);
      }
    },
  });

  pi.on("input", async (event, ctx) => {
    const invokedSkill = event.text.match(/^\/skill:thai-contextual-editor(?:\s+([\s\S]*))?$/);
    if (!invokedSkill) return { action: "continue" };
    try {
      await runThaiForm(invokedSkill[1] ?? "", pi, ctx);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      ctx.ui.setStatus("thai-editor", undefined);
    }
    return { action: "handled" };
  });
}
