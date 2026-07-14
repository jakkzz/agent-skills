import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

interface FleetHostStatus {
  name: string;
  sshAlias: string;
  platform: "unix" | "windows";
  viaTailnet: boolean;
  connected: boolean;
  installed?: boolean;
  clientVersion?: string;
  serverStatus?: string;
  serverVersion?: string;
  protocol?: string;
  compatible?: string;
  error?: string;
}

interface FleetReport {
  backendState?: string;
  tailnetEnforced: true;
  summary: string;
  hosts: FleetHostStatus[];
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

function toolContent(report: FleetReport): string {
  const truncated = truncateHead(report.summary, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncated.truncated) return truncated.content;
  return `${truncated.content}\n\n[Output truncated to ${DEFAULT_MAX_LINES} lines / ${DEFAULT_MAX_BYTES} bytes.]`;
}

function sanitizedDetails(report: FleetReport) {
  return {
    backendState: report.backendState,
    tailnetEnforced: true,
    counts: {
      hosts: report.hosts.length,
      connected: report.hosts.filter((host) => host.connected).length,
      installed: report.hosts.filter((host) => host.installed).length,
      compatible: report.hosts.filter((host) => host.compatible === "yes").length,
    },
    hosts: report.hosts.map((host) => ({
      name: host.name,
      platform: host.platform,
      viaTailnet: host.viaTailnet,
      connected: host.connected,
      installed: host.installed,
      clientVersion: host.clientVersion,
      serverStatus: host.serverStatus,
      serverVersion: host.serverVersion,
      protocol: host.protocol,
      compatible: host.compatible,
    })),
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "herdr_tailnet_status",
    label: "Herdr Tailnet Status",
    description: "Read-only audit of up to 32 configured Herdr machines. SSH is pinned to an address advertised by the active Tailscale control plane; proxy routes are rejected. Reports connectivity, Herdr versions, server status, and compatibility. Output is truncated at Pi's 50KB/2000-line limits.",
    promptSnippet: "Audit configured Herdr hosts over control-plane-verified Tailscale SSH routes",
    promptGuidelines: [
      "Use herdr_tailnet_status before installing, updating, restarting, or attaching to Herdr on a Tailnet machine.",
      "The herdr_tailnet_status tool is read-only; use the herdr-tailnet-fleet skill and obtain explicit confirmation before remote mutations.",
    ],
    parameters: Type.Object({
      target: Type.Optional(Type.String({ maxLength: 128, description: "Optional configured machine name or SSH alias" })),
    }),
    async execute(_toolCallId, params, signal) {
      const report = await auditFleet(pi, params.target, signal);
      return {
        content: [{ type: "text", text: toolContent(report) }],
        details: sanitizedDetails(report),
      };
    },
  });

  pi.registerCommand("herdr-fleet", {
    description: "Show read-only Herdr status across configured Tailscale SSH hosts",
    handler: async (args, ctx) => {
      try {
        const report = await auditFleet(pi, args || undefined, ctx.signal);
        const summary = toolContent(report);
        if (ctx.hasUI) ctx.ui.notify(summary, "info");
        else console.log(summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) ctx.ui.notify(message, "error");
        else console.error(message);
      }
    },
  });
}
