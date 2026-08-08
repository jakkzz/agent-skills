import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export function thaiWorkflowInstructions(): string {
  return [
    "Use the thai-contextual-editor skill for this task.",
    "Before reviewing or editing project text, look for thai-guide/README.md from the Git root. If it exists, read it, the relevant domain guide, and relevant approved examples under thai-guide/; treat those files as the project Thai style SSOT.",
    "Infer whether the request needs manual style calibration, application of approved examples, polishing, translation, original writing, terminology work, or a repository review. Do not ask the user to choose a named mode.",
    "Recognize concise request forms. `ui` or `ui <scope>` means prepare a manual Markdown worksheet of user-visible Thai frontend text; with no scope, gather the complete frontend UI scope, and with a scope such as attendance, gather only that page or feature. `ui learn [scope]` means import completed worksheet pairs after confirmation into thai-guide/examples/. `apply <scope> dry run` means use approved examples to propose bounded changes without writing files. `apply <scope>` still requires proposals and explicit approval before writing.",
    "For `ui [scope]`: identify only user-visible Thai text, excluding comments, tests, generated files, documentation, and non-UI data unless requested. Create an editable Markdown worksheet and matching NUL-delimited source-file manifest under the repository Git path `thai-review/` (resolved with `git rev-parse --git-path`, never committed). Group identical original text while retaining every source path, line, column, and key in HTML comments. Each entry must contain the original text, one blank line where the user writes the preferred wording, then `---`. Reply with the exact shell-safe command `nvim <worksheet-path>` and counts for files, source entries, and unique texts. Do not run interactive nvim in the agent pane, propose rewrites, or edit product source.",
    "For `ui learn [scope]`: parse the matching Markdown worksheet. Ignore blank preferred lines. Validate that protected placeholders are unchanged, present completed original/preferred pairs for confirmation, then append only user-confirmed wording with source context and key to the relevant file under thai-guide/examples/. Do not modify product source, commit, push, or revert anything.",
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
    description: "Teach or apply the project Thai style guide; shortcuts: ui, apply <scope> dry run",
    getArgumentCompletions: (prefix) => {
      const shortcuts = ["ui", "ui attendance", "ui learn attendance", "apply attendance dry run"];
      const normalized = prefix.trimStart();
      const matches = shortcuts.filter((shortcut) => shortcut.startsWith(normalized));
      return matches.length ? matches.map((shortcut) => ({ value: shortcut, label: shortcut })) : null;
    },
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
