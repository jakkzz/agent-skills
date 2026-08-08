import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export function thaiWorkflowInstructions(): string {
  return [
    "Use the thai-contextual-editor skill for this task.",
    "Before reviewing or editing project text, look for thai-guide/README.md from the Git root. If it exists, read it, the relevant domain guide, and relevant approved examples under thai-guide/; treat those files as the project Thai style SSOT.",
    "Infer whether the request needs manual style calibration, application of approved examples, polishing, translation, original writing, terminology work, or a repository review. Do not ask the user to choose a named mode.",
    "For manual style calibration: show one real in-scope text at a time with its user-visible context, source location, and key; do not propose a rewrite unless asked; wait for the user to write the preferred wording or say keep/skip; confirm the exact before/after; then record only the user-approved example under thai-guide/examples/. Do not edit product source during calibration.",
    "Apply approved examples to product files only when the user explicitly asks. Before writing, propose a bounded set of changes and wait for approval.",
    "Do not scan or rewrite the whole repository unless the request explicitly asks for that scope. Preserve facts, protected text, code, keys, placeholders, URLs, and citations. Inspect the relevant files and context before proposing or applying changes.",
    "For repository edits, show a bounded diff, run appropriate validation, and do not commit or push unless requested.",
  ].join("\n");
}

async function thaiRequestFromArgs(args: string, ctx: ExtensionCommandContext): Promise<string | null> {
  const request = args.trim();
  if (request) return request;
  if (!ctx.hasUI) {
    ctx.ui.notify("Use /thai followed by a natural-language request", "error");
    return null;
  }
  return (await ctx.ui.editor(
    "What should /thai do?",
    "Describe the page or text, whether you are teaching examples or applying them, and anything that must not change.",
  ))?.trim() || null;
}

export default function thaiEditorExtension(pi: ExtensionAPI) {
  let thaiTurnPending = false;

  pi.registerCommand("thai", {
    description: "Teach or apply the project Thai style guide using a natural-language request",
    handler: async (args, ctx) => {
      const request = await thaiRequestFromArgs(args, ctx);
      if (!request) return;
      thaiTurnPending = true;
      try {
        pi.sendUserMessage(request);
      } catch (error) {
        thaiTurnPending = false;
        throw error;
      }
    },
  });

  pi.on("input", (event) => {
    const invokedSkill = event.text.match(/^\/skill:thai-contextual-editor(?:\s+([\s\S]*))?$/);
    if (!invokedSkill) return { action: "continue" };
    const request = invokedSkill[1]?.trim();
    if (!request) return { action: "continue" };
    thaiTurnPending = true;
    return { action: "transform", text: request };
  });

  pi.on("before_agent_start", (event) => {
    if (!thaiTurnPending) return;
    thaiTurnPending = false;
    return { systemPrompt: `${event.systemPrompt}\n\n${thaiWorkflowInstructions()}` };
  });
}
