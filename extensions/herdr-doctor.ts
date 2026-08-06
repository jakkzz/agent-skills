import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { access, copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  REQUIRED_PLUGINS,
  appendMissingBindings,
  compareVersions,
  formatServerStatus,
  missingBindingCommands,
  parseIntegrationStatus,
  parsePluginRegistry,
  type PluginRecord,
} from "../lib/herdr-doctor-core.ts";
import { SHORTCUTS } from "../lib/herdr-doctor-shortcuts.ts";

type RunResult = { code: number; stdout: string; stderr: string };
type PluginAudit = {
  id: string;
  repo: string;
  installed?: PluginRecord;
  latestCommit?: string;
  outdated: boolean;
};
export type Audit = {
  herdrFound: boolean;
  herdrVersion?: string;
  herdrLatest?: string;
  herdrManagedByBrew: boolean;
  serverStatus: string;
  plugins: PluginAudit[];
  missingBindings: string[];
  integrations: Array<{ name: string; state: string }>;
  nvimFound: boolean;
  nvimVersion?: string;
  nvimSupported: boolean;
  nvimManagedByBrew: boolean;
  nvimModuleAvailable: boolean;
  nvimConfigured: boolean;
  notes: string[];
};
type Action = { id: string; label: string; dangerous?: boolean };

const HOME = homedir();
const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || join(HOME, ".config");
const HERDR_DIR = join(XDG_CONFIG_HOME, "herdr");
const HERDR_CONFIG = process.env.HERDR_CONFIG_PATH || join(HERDR_DIR, "config.toml");
const PLUGIN_REGISTRY = join(HERDR_DIR, "plugins.json");

export default function herdrDoctorExtension(pi: ExtensionAPI) {
  const run = async (command: string, args: string[] = [], timeout = 15_000): Promise<RunResult> => {
    const result = await pi.exec(command, args, { timeout });
    return {
      code: result.code ?? 1,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.stderr?.trim() ?? "",
    };
  };

  const inspect = async (): Promise<Audit> => {
    const notes: string[] = [];
    const [herdrVersionResult, brewList, serverResult, rawRegistry, rawConfig, integrations, nvimVersionResult, brewNvim] =
      await Promise.all([
        run("herdr", ["--version"]),
        run("brew", ["list", "--versions", "herdr"]),
        run("herdr", ["status", "server"]),
        readText(PLUGIN_REGISTRY),
        readText(HERDR_CONFIG),
        run("herdr", ["integration", "status"]),
        run("nvim", ["--version"]),
        run("brew", ["list", "--versions", "neovim"]),
      ]);

    const herdrFound = herdrVersionResult.code === 0;
    const herdrVersion = herdrVersionResult.stdout.match(/\d+\.\d+\.\d+/)?.[0];
    const herdrManagedByBrew = brewList.code === 0 && /\bherdr\b/.test(brewList.stdout);
    let herdrLatest: string | undefined;

    if (herdrManagedByBrew) {
      const info = await run("brew", ["info", "--json=v2", "herdr"], 30_000);
      try {
        herdrLatest = JSON.parse(info.stdout)?.formulae?.[0]?.versions?.stable;
      } catch {
        notes.push("อ่านเวอร์ชันล่าสุดจาก Homebrew ไม่สำเร็จ");
      }
    } else if (herdrFound) {
      notes.push("Herdr ไม่ได้ติดตั้งผ่าน Homebrew จึงตรวจเวอร์ชันล่าสุดแบบ read-only ไม่ได้");
    }

    const registry = parsePluginRegistry(rawRegistry);
    const plugins = await Promise.all(
      REQUIRED_PLUGINS.map(async ({ id, repo }): Promise<PluginAudit> => {
        const installed = registry.find((item) => item.plugin_id === id);
        const trackedRef = installed?.source?.ref || "HEAD";
        const remote = await run("git", ["ls-remote", `https://github.com/${repo}.git`, trackedRef], 12_000);
        const latestCommit = remote.code === 0 ? remote.stdout.split(/\s+/)[0] : undefined;
        if (!latestCommit) notes.push(`ตรวจ commit ล่าสุดของ ${id} ไม่สำเร็จ`);
        return {
          id,
          repo,
          installed,
          latestCommit,
          outdated: Boolean(!installed?.source?.ref && installed?.source?.resolved_commit && latestCommit && installed.source.resolved_commit !== latestCommit),
        };
      }),
    );

    const nvimFound = nvimVersionResult.code === 0;
    const nvimVersion = nvimVersionResult.stdout.match(/NVIM v?(\d+\.\d+\.\d+)/)?.[1];
    const nvimSupported = Boolean(nvimVersion && compareVersions(nvimVersion, "0.10.0") >= 0);
    const nvimManagedByBrew = brewNvim.code === 0 && /\bneovim\b/.test(brewNvim.stdout);
    const nvimPlugin = registry.find((item) => item.plugin_id === "chmarax.herdr-nvim");
    let nvimModuleAvailable = false;
    if (nvimFound && nvimPlugin?.plugin_root) {
      const luaRoot = JSON.stringify(nvimPlugin.plugin_root);
      const moduleCheck = await run(
        "nvim",
        ["--clean", "--headless", `+lua vim.opt.runtimepath:append(${luaRoot}); local ok=pcall(require,'herdr-nvim'); if not ok then vim.cmd('cq') end`, "+qa"],
        12_000,
      );
      nvimModuleAvailable = moduleCheck.code === 0;
    }
    const nvimConfigured = await nvimConfigReferencesHerdr(join(XDG_CONFIG_HOME, "nvim"));

    return {
      herdrFound,
      herdrVersion,
      herdrLatest,
      herdrManagedByBrew,
      serverStatus: serverResult.code === 0 ? formatServerStatus(serverResult.stdout) : serverResult.stderr || "not running",
      plugins,
      missingBindings: missingBindingCommands(rawConfig),
      integrations: parseIntegrationStatus(integrations.stdout || integrations.stderr),
      nvimFound,
      nvimVersion,
      nvimSupported,
      nvimManagedByBrew,
      nvimModuleAvailable,
      nvimConfigured,
      notes: [...new Set(notes)],
    };
  };

  const emitHeadlessReport = (content: string, ctx: ExtensionCommandContext) => {
    if (ctx.mode === "print") console.log(content);
    else pi.sendMessage({ customType: "herdr-doctor", content, display: true }, { deliverAs: "nextTurn" });
  };

  const showShortcuts = async (ctx: ExtensionCommandContext) => {
    if (ctx.hasUI) await ctx.ui.editor("Herdr + Neovim shortcuts", SHORTCUTS);
    else emitHeadlessReport(SHORTCUTS, ctx);
  };

  const runDoctor = async (_args: string, ctx: ExtensionCommandContext) => {
    let audit = await inspect();
    if (!ctx.hasUI) {
      emitHeadlessReport(formatReport(audit), ctx);
      return;
    }

    for (;;) {
      const actions = availableActions(audit);
      const menu = ["ดูรายงานฉบับเต็ม", "ตรวจสอบใหม่", "ดู shortcuts ของ Herdr และ Neovim", ...actions.map((item) => item.label), "ปิด"];
      const choice = await ctx.ui.select("Herdr Doctor", menu);
      if (!choice || choice === "ปิด") return;
      if (choice === "ดูรายงานฉบับเต็ม") {
        await ctx.ui.editor("Herdr Doctor report", formatReport(audit));
        continue;
      }
      if (choice === "ตรวจสอบใหม่") {
        audit = await inspect();
        ctx.ui.notify("ตรวจสอบใหม่แล้ว", "info");
        continue;
      }
      if (choice === "ดู shortcuts ของ Herdr และ Neovim") {
        await showShortcuts(ctx);
        continue;
      }
      const action = actions.find((item) => item.label === choice);
      if (!action) continue;
      const confirmed = await ctx.ui.confirm("ยืนยันการเปลี่ยนแปลง", confirmationText(action));
      if (!confirmed) continue;

      ctx.ui.setStatus("herdr-doctor", "กำลังดำเนินการ…");
      try {
        await applyAction(action.id, audit, run);
        ctx.ui.notify("ดำเนินการเสร็จแล้ว กำลังตรวจสอบซ้ำ", "info");
        audit = await inspect();
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      } finally {
        ctx.ui.setStatus("herdr-doctor", undefined);
      }
    }
  };

  pi.registerCommand("herdr-doctor", {
    description: "ตรวจและซ่อมการติดตั้ง Herdr, plugins และ Neovim แบบมีการยืนยัน",
    handler: runDoctor,
  });
  pi.registerCommand("herdr-setup", {
    description: "เปิดตัวช่วยตั้งค่า Herdr, gitview, herdr-nvim และ Neovim",
    handler: runDoctor,
  });
  pi.registerCommand("herdr-shortcuts", {
    description: "แสดง shortcuts ของ gitview, herdr-nvim และ Neovim",
    handler: async (_args, ctx) => showShortcuts(ctx),
  });
}

export function availableActions(audit: Audit): Action[] {
  const actions: Action[] = [];
  if (!audit.herdrFound) {
    actions.push({ id: "install-herdr", label: "ติดตั้ง Herdr ผ่าน Homebrew" });
  } else if (audit.herdrLatest && audit.herdrVersion && compareVersions(audit.herdrVersion, audit.herdrLatest) < 0) {
    actions.push({ id: "update-herdr", label: `อัปเดต Herdr ${audit.herdrVersion} → ${audit.herdrLatest}` });
  }

  for (const plugin of audit.plugins) {
    const requirement = REQUIRED_PLUGINS.find((item) => item.id === plugin.id)?.minHerdrVersion;
    const compatible = Boolean(audit.herdrVersion && requirement && compareVersions(audit.herdrVersion, requirement) >= 0);
    const commitLabel = plugin.latestCommit ? ` @ ${plugin.latestCommit.slice(0, 12)}` : "";
    if (!plugin.installed && compatible && plugin.latestCommit) actions.push({ id: `install-plugin:${plugin.id}`, label: `ติดตั้ง plugin ${plugin.id}${commitLabel}` });
    else if (plugin.outdated && plugin.latestCommit) actions.push({ id: `update-plugin:${plugin.id}`, label: `อัปเดต plugin ${plugin.id}${commitLabel}` });
    else if (plugin.installed?.enabled === false) actions.push({ id: `enable-plugin:${plugin.id}`, label: `เปิดใช้ plugin ${plugin.id}` });
  }

  if (audit.missingBindings.length) actions.push({ id: "configure-bindings", label: "เพิ่ม shortcuts ที่ขาดใน Herdr config" });
  if (!audit.nvimFound) actions.push({ id: "install-nvim", label: "ติดตั้ง Neovim ผ่าน Homebrew" });
  else if (!audit.nvimSupported && audit.nvimManagedByBrew) actions.push({ id: "update-nvim", label: "อัปเดต Neovim ให้เป็น 0.10 ขึ้นไป" });
  for (const integration of audit.integrations.filter((item) => item.state.startsWith("outdated"))) {
    actions.push({ id: `integration:${integration.name}`, label: `อัปเดต Herdr integration: ${integration.name}` });
  }
  return actions;
}

async function applyAction(id: string, audit: Audit, run: (command: string, args?: string[], timeout?: number) => Promise<RunResult>) {
  if (id === "install-herdr") return requireSuccess(await run("brew", ["install", "herdr"], 300_000), "ติดตั้ง Herdr");
  if (id === "update-herdr") {
    if (!audit.herdrManagedByBrew) throw new Error("รองรับการอัปเดตอัตโนมัติเฉพาะ Herdr ที่ติดตั้งผ่าน Homebrew");
    return requireSuccess(await run("brew", ["upgrade", "herdr"], 300_000), "อัปเดต Herdr");
  }
  if (id === "install-nvim") return requireSuccess(await run("brew", ["install", "neovim"], 300_000), "ติดตั้ง Neovim");
  if (id === "update-nvim") return requireSuccess(await run("brew", ["upgrade", "neovim"], 300_000), "อัปเดต Neovim");
  if (id === "configure-bindings") {
    const current = await readText(HERDR_CONFIG);
    const written = await writeWithBackup(HERDR_CONFIG, appendMissingBindings(current));
    const reload = await run("herdr", ["server", "reload-config"]);
    if (reload.code !== 0) {
      await rollbackWrite(HERDR_CONFIG, written);
      throw new Error(`reload config ไม่สำเร็จ จึงคืนไฟล์เดิมแล้ว: ${reload.stderr || reload.stdout}`);
    }
    return;
  }
  if (id.startsWith("integration:")) {
    const name = id.slice("integration:".length);
    return requireSuccess(await run("herdr", ["integration", "install", name], 60_000), `อัปเดต integration ${name}`);
  }

  const [verb, pluginId] = id.split(":", 2);
  const plugin = REQUIRED_PLUGINS.find((item) => item.id === pluginId);
  if (!plugin) throw new Error(`ไม่รู้จัก plugin: ${pluginId}`);
  if (verb === "install-plugin") {
    const candidate = audit.plugins.find((item) => item.id === plugin.id);
    if (!candidate?.latestCommit) throw new Error(`ไม่มี commit ที่ตรวจสอบแล้วสำหรับ ${plugin.id}`);
    return requireSuccess(
      await run("herdr", ["plugin", "install", plugin.repo, "--ref", candidate.latestCommit, "--yes"], 180_000),
      `ติดตั้ง ${plugin.id}`,
    );
  }
  if (verb === "enable-plugin") {
    return requireSuccess(await run("herdr", ["plugin", "enable", plugin.id]), `เปิดใช้ ${plugin.id}`);
  }
  if (verb === "update-plugin") {
    const candidate = audit.plugins.find((item) => item.id === plugin.id);
    const nextCommit = candidate?.latestCommit;
    const previousCommit = candidate?.installed?.source?.resolved_commit;
    if (!nextCommit || !previousCommit) throw new Error(`ข้อมูล commit ของ ${plugin.id} ไม่ครบ จึงไม่อัปเดต`);
    requireSuccess(await run("herdr", ["plugin", "uninstall", plugin.id], 60_000), `ถอน ${plugin.id} เวอร์ชันเดิม`);
    const install = await run("herdr", ["plugin", "install", plugin.repo, "--ref", nextCommit, "--yes"], 180_000);
    if (install.code === 0) return;
    const rollback = await run("herdr", ["plugin", "install", plugin.repo, "--ref", previousCommit, "--yes"], 180_000);
    const rollbackMessage = rollback.code === 0 ? "คืนเวอร์ชันเดิมสำเร็จ" : `คืนเวอร์ชันเดิมไม่สำเร็จ: ${rollback.stderr || rollback.stdout}`;
    throw new Error(`ติดตั้ง ${plugin.id} เวอร์ชันใหม่ไม่สำเร็จ; ${rollbackMessage}`);
  }
  throw new Error(`ไม่รองรับ action: ${id}`);
}

function formatReport(audit: Audit): string {
  const latest = audit.herdrLatest ? ` (ล่าสุด ${audit.herdrLatest})` : "";
  const lines = [
    "# Herdr Doctor",
    "",
    `- Herdr: ${audit.herdrFound ? audit.herdrVersion ?? "พบ binary" : "ไม่พบ"}${latest}`,
    `- ตัวจัดการแพ็กเกจ: ${audit.herdrManagedByBrew ? "Homebrew" : "ไม่ทราบ/ติดตั้งโดยตรง"}`,
    `- Server: ${audit.serverStatus}`,
    "",
    "## Plugins",
  ];
  for (const plugin of audit.plugins) {
    const state = !plugin.installed
      ? "ไม่พบ"
      : plugin.outdated
        ? `ควรอัปเดต (${plugin.installed.version ?? "unknown"})`
        : plugin.installed.enabled === false
          ? "ติดตั้งแล้วแต่ปิดอยู่"
          : `พร้อมใช้ (${plugin.installed.version ?? "unknown"})`;
    lines.push(`- ${plugin.id}: ${state}`);
  }
  lines.push(
    "",
    "## Configuration",
    `- Herdr keybindings: ${audit.missingBindings.length ? `ขาด ${audit.missingBindings.join(", ")}` : "ครบ"}`,
    `- Neovim: ${audit.nvimFound ? `v${audit.nvimVersion ?? "unknown"}` : "ไม่พบ"}`,
    `- Neovim ≥ 0.10: ${audit.nvimSupported ? "ผ่าน" : "ไม่ผ่าน"}`,
    `- Neovim จัดการโดย Homebrew: ${audit.nvimManagedByBrew ? "ใช่" : "ไม่ใช่/ไม่ทราบ"}`,
    `- herdr-nvim module พร้อมใช้: ${audit.nvimModuleAvailable ? "ใช่" : "ไม่ใช่"}`,
    `- มีการอ้างอิง herdr-nvim ใน config: ${audit.nvimConfigured ? "มี" : "ไม่มี (ไม่จำเป็นสำหรับ Herdr sidebar daemon)"}`,
    "",
    "## Agent integrations",
  );
  for (const integration of audit.integrations) lines.push(`- ${integration.name}: ${integration.state}`);
  if (audit.notes.length) lines.push("", "## หมายเหตุ", ...audit.notes.map((note) => `- ${note}`));
  return lines.join("\n");
}

function confirmationText(action: Action): string {
  if (action.id.startsWith("update-plugin:")) {
    return `${action.label}\n\nระบบจะถอน plugin เดิม ติดตั้ง commit ที่แสดง และพยายามคืน commit เดิมอัตโนมัติหากติดตั้งไม่สำเร็จ`;
  }
  if (action.id === "update-herdr") {
    return `${action.label}\n\nอัปเดต binary ผ่าน Homebrew โดยไม่หยุด Herdr server ที่กำลังทำงาน อาจต้องเปิด Herdr ใหม่ภายหลัง`;
  }
  return action.label;
}

function requireSuccess(result: RunResult, label: string) {
  if (result.code !== 0) throw new Error(`${label}ไม่สำเร็จ: ${result.stderr || result.stdout || `exit ${result.code}`}`);
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

type WriteBackup = { existed: boolean; backupPath?: string };

async function writeWithBackup(path: string, content: string): Promise<WriteBackup> {
  await mkdir(dirname(path), { recursive: true });
  const existed = await exists(path);
  const backupPath = existed ? `${path}.bak.${Date.now()}` : undefined;
  if (backupPath) await copyFile(path, backupPath);
  const temporaryPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return { existed, backupPath };
}

async function rollbackWrite(path: string, backup: WriteBackup) {
  if (!backup.existed) {
    await unlink(path).catch(() => undefined);
    return;
  }
  if (!backup.backupPath) throw new Error(`ไม่มี backup สำหรับคืนไฟล์ ${path}`);
  const temporaryPath = `${path}.rollback.${process.pid}.${Date.now()}`;
  await copyFile(backup.backupPath, temporaryPath);
  await rename(temporaryPath, path);
}

async function nvimConfigReferencesHerdr(root: string): Promise<boolean> {
  if (!await exists(root)) return false;
  const pending: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];
  while (pending.length) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current.path, entry.name);
      if (entry.isDirectory() && current.depth < 4) {
        pending.push({ path, depth: current.depth + 1 });
      } else if (entry.isFile() && /\.(?:lua|vim|json|toml)$/.test(entry.name)) {
        const content = await readText(path);
        if (/ChmaraX\/herdr-nvim|require\s*\(\s*["']herdr-nvim["']\s*\)/.test(content)) return true;
      }
    }
  }
  return false;
}
