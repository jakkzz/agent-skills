import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const helperScript = resolve(extensionDir, "../skills/herdr-tab-namer/scripts/name-tab.sh");

const genericFollowUps = new Set([
  "continue",
  "do it",
  "go ahead",
  "ok",
  "okay",
  "thanks",
  "thank you",
  "yes",
]);

function managedHerdrContext(): boolean {
  return process.env.HERDR_ENV === "1" && Boolean(process.env.HERDR_TAB_ID?.trim());
}

export function deriveTabLabel(rawPrompt: string): string | undefined {
  let text = rawPrompt
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/^[\s#>*-]+/u, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!text || text.startsWith("/")) return undefined;

  const normalized = text.toLocaleLowerCase();
  if (genericFollowUps.has(normalized)) return undefined;

  if (/\b(?:password|passcode|secret|token|api[\s_-]?key|authorization|bearer|private[\s_-]?key)\b/iu.test(text)) {
    return "Sensitive task";
  }

  text = text
    .replace(/^(?:please\s+)?(?:can|could|would|will)\s+you\s+/iu, "")
    .replace(/^i\s+(?:want|need)\s+(?:you\s+)?to\s+/iu, "")
    .replace(/^help\s+me\s+(?:to\s+)?/iu, "")
    .replace(/^[\s#>*-]+/u, "")
    .trim();

  if (!text) return undefined;

  const words = text.split(/\s+/u).slice(0, 6);
  let label = words.join(" ").replace(/[.,;:!?]+$/u, "");
  if (!label) return undefined;

  label = label.charAt(0).toLocaleUpperCase() + label.slice(1);
  if (label.length > 48) label = `${label.slice(0, 47)}…`;
  return label;
}

async function renameCurrentTab(pi: ExtensionAPI, label: string): Promise<string> {
  const result = await pi.exec(helperScript, [label], { timeout: 3_000 });
  if (result.code !== 0) {
    throw new Error((result.stderr || "unable to rename the current Herdr tab").trim());
  }
  return result.stdout.trim() || label;
}

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    if (
      event.source === "extension" ||
      event.streamingBehavior !== undefined ||
      !managedHerdrContext()
    ) {
      return { action: "continue" };
    }

    const label = deriveTabLabel(event.text);
    if (!label) return { action: "continue" };

    try {
      await renameCurrentTab(pi, label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (ctx.hasUI) ctx.ui.notify(`Herdr tab rename skipped: ${message}`, "warning");
    }

    return { action: "continue" };
  });

  pi.registerCommand("herdr-tab-name", {
    description: "Rename the current Herdr tab",
    handler: async (args, ctx) => {
      if (!managedHerdrContext()) {
        ctx.ui.notify("Not running inside a Herdr-managed pane", "warning");
        return;
      }

      const label = deriveTabLabel(args);
      if (!label) {
        ctx.ui.notify("Usage: /herdr-tab-name <label>", "warning");
        return;
      }

      try {
        const renamed = await renameCurrentTab(pi, label);
        ctx.ui.notify(`Herdr tab: ${renamed}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Herdr tab rename failed: ${message}`, "error");
      }
    },
  });
}
