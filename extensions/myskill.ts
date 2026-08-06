import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, "..");
const updateScript = resolve(packageRoot, "scripts/myskill-update.sh");

function conciseOutput(stdout: string, stderr: string): string {
  const text = `${stdout}\n${stderr}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join("\n");
  return text || "No output";
}

export default function mySkillExtension(pi: ExtensionAPI) {
  pi.registerCommand("myskill", {
    description: "Status or safely synchronize custom skills and their shared symlinks",
    getArgumentCompletions: (prefix) => {
      const actions = ["status", "update"];
      const matches = actions.filter((action) => action.startsWith(prefix.trim()));
      return matches.length > 0
        ? matches.map((action) => ({ value: action, label: action }))
        : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim() || "status";
      if (action !== "status" && action !== "update") {
        ctx.ui.notify("Usage: /myskill <status|update>", "warning");
        return;
      }

      ctx.ui.setStatus("myskill", action === "update" ? "Updating custom skills…" : "Checking custom skills…");
      let reloading = false;
      try {
        const result = await pi.exec(updateScript, [action, packageRoot], { timeout: 120_000 });
        const output = conciseOutput(result.stdout, result.stderr);
        if (result.code === 75 && action === "update") {
          ctx.ui.notify(`myskill update was only partially completed\n${output}\nReloading the updated checkout.`, "warning");
          reloading = true;
          ctx.ui.setStatus("myskill", undefined);
          await ctx.reload();
          return;
        }
        if (result.code !== 0) {
          ctx.ui.notify(`myskill ${action} failed\n${output}`, "error");
          return;
        }

        ctx.ui.notify(output, "info");
        if (action === "update") {
          reloading = true;
          ctx.ui.setStatus("myskill", undefined);
          await ctx.reload();
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`myskill ${action} failed: ${message}`, "error");
      } finally {
        if (!reloading) ctx.ui.setStatus("myskill", undefined);
      }
    },
  });
}
