import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface FleetReport {
  configPath: string;
  tailnet?: string;
  backendState?: string;
  requireTailnet: boolean;
  summary: string;
  hosts: Array<{
    name: string;
    sshAlias: string;
    platform: "unix" | "windows";
    viaTailnet: boolean;
    connected: boolean;
    installed?: boolean;
    clientVersion?: string;
    serverStatus?: string;
    serverVersion?: string;
    compatible?: string;
    error?: string;
  }>;
}

const extensionDir = dirname(fileURLToPath(import.meta.url));
const statusScript = resolve(extensionDir, "../scripts/herdr-tailnet-status.mjs");

async function auditFleet(pi: ExtensionAPI, target?: string, signal?: AbortSignal): Promise<FleetReport> {
  const args = [statusScript, "--json"];
  if (target?.trim()) args.push("--target", target.trim());

  const result = await pi.exec(process.execPath, args, { timeout: 45_000, signal });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "Herdr Tailnet audit failed").trim());
  }
  return JSON.parse(result.stdout) as FleetReport;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "herdr_tailnet_status",
    label: "Herdr Tailnet Status",
    description: "Read-only audit of configured Herdr machines over SSH aliases that resolve inside the active Tailscale network. Reports route verification, SSH connectivity, Herdr versions, server status, and protocol compatibility. Output is capped by the small configured fleet.",
    promptSnippet: "Audit configured Herdr hosts over verified Tailscale SSH routes",
    promptGuidelines: [
      "Use herdr_tailnet_status before installing, updating, restarting, or attaching to Herdr on a Tailnet machine.",
      "The herdr_tailnet_status tool is read-only; use the herdr-tailnet-fleet skill and obtain explicit confirmation before remote mutations.",
    ],
    parameters: Type.Object({
      target: Type.Optional(Type.String({ description: "Optional configured machine name or SSH alias" })),
    }),
    async execute(_toolCallId, params, signal) {
      const report = await auditFleet(pi, params.target, signal);
      return {
        content: [{ type: "text", text: report.summary }],
        details: report,
      };
    },
  });

  pi.registerCommand("herdr-fleet", {
    description: "Show read-only Herdr status across configured Tailscale SSH hosts",
    handler: async (args, ctx) => {
      try {
        const report = await auditFleet(pi, args || undefined, ctx.signal);
        if (ctx.hasUI) ctx.ui.notify(report.summary, "info");
        else console.log(report.summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) ctx.ui.notify(message, "error");
        else console.error(message);
      }
    },
  });
}
