import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export function buildThaiAgentRequest(request: string): string {
  return [
    "Use the thai-contextual-editor skill for this task.",
    "Before reviewing or editing project text, look for thai-guide/README.md from the Git root. If it exists, read it and the relevant domain guide under thai-guide/; treat those files as the project Thai style SSOT.",
    "Infer whether the request needs polishing, translation, original writing, terminology work, or a repository review from the request itself. Do not ask the user to choose a mode.",
    "Do not scan or rewrite the whole repository unless the request explicitly asks for that scope. Preserve facts, protected text, code, keys, placeholders, URLs, and citations. Inspect the relevant files and context before proposing or applying changes.",
    "For repository edits, show a bounded diff, run appropriate validation, and do not commit or push unless requested.",
    "",
    "User request:",
    request.trim(),
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
    "What should /thai review or write?",
    "Describe the text, files, audience, and anything that must not change.",
  ))?.trim() || null;
}

export default function thaiEditorExtension(pi: ExtensionAPI) {
  pi.registerCommand("thai", {
    description: "Apply the project Thai guide to a natural-language writing or review request",
    handler: async (args, ctx) => {
      const request = await thaiRequestFromArgs(args, ctx);
      if (!request) return;
      pi.sendUserMessage(buildThaiAgentRequest(request));
    },
  });

  pi.on("input", (event) => {
    const invokedSkill = event.text.match(/^\/skill:thai-contextual-editor(?:\s+([\s\S]*))?$/);
    if (!invokedSkill) return { action: "continue" };
    const request = invokedSkill[1]?.trim();
    if (!request) return { action: "continue" };
    return { action: "transform", text: buildThaiAgentRequest(request) };
  });
}
