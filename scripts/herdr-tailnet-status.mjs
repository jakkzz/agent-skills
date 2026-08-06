#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as dns } from "node:dns";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_CONFIG = resolve(homedir(), ".config/herdr-tailnet/fleet.json");
const MAX_BUFFER = 128 * 1024;
const MAX_HOSTS = 32;
const CONCURRENCY = 4;
const VALID_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9_. -]{0,63}$/;

function parseArgs(argv) {
  const options = { config: process.env.HERDR_TAILNET_CONFIG || DEFAULT_CONFIG, json: false, target: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--config") {
      options.config = argv[++i];
      if (!options.config) throw new Error("--config requires a path");
    } else if (arg === "--target") {
      options.target = argv[++i];
      if (!options.target) throw new Error("--target requires a machine name or SSH alias");
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: herdr-tailnet-status.mjs [--json] [--config PATH] [--target NAME_OR_ALIAS]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.config = resolve(options.config.replace(/^~(?=\/)/, homedir()));
  return options;
}

async function run(command, args, timeout = 12_000) {
  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
      timeout,
      maxBuffer: MAX_BUFFER,
      encoding: "utf8",
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || "command failed"),
    };
  }
}

async function loadConfig(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Fleet config not found: ${path}. Create it from the documented version 1 example.`);
    }
    throw error;
  }

  const config = JSON.parse(raw);
  if (config.version !== 1 || !Array.isArray(config.hosts)) {
    throw new Error("Fleet config must contain version: 1 and a hosts array");
  }
  if (config.requireTailnet === false) {
    throw new Error("requireTailnet=false is not supported; this audit always enforces Tailnet-only SSH routes");
  }
  if (config.hosts.length === 0 || config.hosts.length > MAX_HOSTS) {
    throw new Error(`Fleet config must contain 1-${MAX_HOSTS} hosts`);
  }

  const names = new Set();
  const aliases = new Set();
  for (const host of config.hosts) {
    if (!host || typeof host.name !== "string" || typeof host.sshAlias !== "string") {
      throw new Error("Every fleet host needs string name and sshAlias fields");
    }
    if (!VALID_NAME.test(host.name)) throw new Error(`Unsafe fleet name: ${JSON.stringify(host.name)}`);
    if (!VALID_ALIAS.test(host.sshAlias)) throw new Error(`Unsafe SSH alias: ${JSON.stringify(host.sshAlias)}`);
    if (!['unix', 'windows'].includes(host.platform)) throw new Error(`Unsupported platform for ${host.name}: ${host.platform}`);
    if (names.has(host.name)) throw new Error(`Duplicate fleet name: ${host.name}`);
    if (aliases.has(host.sshAlias)) throw new Error(`Duplicate SSH alias: ${host.sshAlias}`);
    names.add(host.name);
    aliases.add(host.sshAlias);
  }
  return { hosts: config.hosts };
}

async function loadTailnet() {
  const result = await run("tailscale", ["status", "--json"], 10_000);
  if (result.code !== 0) throw new Error(`tailscale status failed: ${result.stderr.trim()}`);
  const status = JSON.parse(result.stdout);
  if (status.BackendState !== "Running") throw new Error(`Tailscale is not running (state: ${status.BackendState || "unknown"})`);

  const nodes = [status.Self, ...Object.values(status.Peer || {})].filter(Boolean);
  const ips = new Set(nodes.flatMap((node) => node.TailscaleIPs || []));
  const dnsToIps = new Map();
  for (const node of nodes) {
    const name = String(node.DNSName || "").replace(/\.$/, "").toLowerCase();
    if (name) dnsToIps.set(name, node.TailscaleIPs || []);
  }
  return { backendState: status.BackendState, ips, dnsToIps };
}

function parseSshConfig(stdout) {
  const values = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^(hostname|user|port|proxycommand|proxyjump)\s+(.+)$/i);
    if (match) values[match[1].toLowerCase()] = match[2].trim();
  }
  return values;
}

async function resolveHost(hostname) {
  if (net.isIP(hostname)) return [hostname];
  try {
    return [...new Set((await dns.lookup(hostname, { all: true })).map((entry) => entry.address))];
  } catch {
    return [];
  }
}

async function verifiedTailnetAddress(routeHost, tailnet) {
  const normalized = String(routeHost || "").replace(/\.$/, "").toLowerCase();
  const resolved = await resolveHost(routeHost);
  const verified = resolved.find((address) => tailnet.ips.has(address));
  if (verified) return verified;
  const advertised = tailnet.dnsToIps.get(normalized) || [];
  return advertised.find((address) => tailnet.ips.has(address));
}

const UNIX_STATUS_COMMAND = String.raw`bin=""; for candidate in "$(command -v herdr 2>/dev/null || true)" "$HOME/.local/bin/herdr" /opt/homebrew/bin/herdr /usr/local/bin/herdr; do if [ -n "$candidate" ] && [ -x "$candidate" ]; then bin="$candidate"; break; fi; done; if [ -z "$bin" ]; then echo __HERDR_MISSING__; exit 0; fi; echo __HERDR_BIN__="$bin"; "$bin" --version 2>&1; echo __HERDR_VERSION_EXIT__=$?; "$bin" status server --json 2>&1; status_exit=$?; echo __HERDR_STATUS_JSON_EXIT__=$status_exit; if [ "$status_exit" -ne 0 ]; then "$bin" status server 2>&1; echo __HERDR_STATUS_TEXT_EXIT__=$?; fi; exit 0`;

const WINDOWS_STATUS_SCRIPT = String.raw`$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$cmd = Get-Command herdr -ErrorAction SilentlyContinue
if ($null -eq $cmd) { Write-Output "__HERDR_MISSING__"; exit 0 }
$exe = $cmd.Source
Write-Output ("__HERDR_BIN__=" + $exe)
& $exe --version 2>&1 | ForEach-Object { Write-Output $_ }
Write-Output ("__HERDR_VERSION_EXIT__=" + $LASTEXITCODE)
& $exe status server --json 2>&1 | ForEach-Object { Write-Output $_ }
$statusExit = $LASTEXITCODE
Write-Output ("__HERDR_STATUS_JSON_EXIT__=" + $statusExit)
if ($statusExit -ne 0) {
  & $exe status server 2>&1 | ForEach-Object { Write-Output $_ }
  Write-Output ("__HERDR_STATUS_TEXT_EXIT__=" + $LASTEXITCODE)
}
exit 0`;
const WINDOWS_STATUS_COMMAND = `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(WINDOWS_STATUS_SCRIPT, "utf16le").toString("base64")}`;

function markerValue(lines, marker) {
  return lines.find((line) => line.startsWith(`${marker}=`))?.slice(marker.length + 1);
}

function parseHerdrOutput(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const missing = lines.includes("__HERDR_MISSING__");
  const binary = markerValue(lines, "__HERDR_BIN__");
  const clientLine = lines.find((line) => /^herdr\s+/i.test(line));
  const statusJson = lines.find((line) => line.startsWith("{") && line.includes('"status"'));
  let parsedStatus;
  if (statusJson) {
    try { parsedStatus = JSON.parse(statusJson); } catch { parsedStatus = undefined; }
  }
  const textValue = (key) => lines.find((line) => line.toLowerCase().startsWith(`${key}:`))?.split(":").slice(1).join(":").trim();
  const statusExit = Number(markerValue(lines, "__HERDR_STATUS_JSON_EXIT__"));

  return {
    installed: !missing && Boolean(binary),
    clientVersion: clientLine?.replace(/^herdr\s+/i, "") || (binary ? "unknown" : undefined),
    serverStatus: parsedStatus?.status || textValue("status") || (binary && statusExit !== 0 ? "unsupported/error" : missing ? "missing" : "unknown"),
    serverVersion: parsedStatus?.version || textValue("version"),
    protocol: parsedStatus?.protocol !== undefined ? String(parsedStatus.protocol) : textValue("protocol"),
    compatible: parsedStatus?.running === false ? undefined : parsedStatus?.compatible !== undefined ? (parsedStatus.compatible ? "yes" : "no") : textValue("compatible"),
  };
}

function compactError(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function auditHost(host, tailnet) {
  const base = {
    name: host.name,
    sshAlias: host.sshAlias,
    platform: host.platform,
    remoteAttachSupported: host.platform !== "windows",
  };
  const sshConfig = await run("ssh", ["-G", "--", host.sshAlias], 5_000);
  if (sshConfig.code !== 0) return { ...base, connected: false, viaTailnet: false, error: compactError(sshConfig.stderr) };

  const route = parseSshConfig(sshConfig.stdout);
  if (!route.hostname) return { ...base, connected: false, viaTailnet: false, error: "SSH alias has no resolved hostname" };
  if (route.proxycommand && route.proxycommand.toLowerCase() !== "none") {
    return { ...base, connected: false, viaTailnet: false, error: "ProxyCommand is not allowed for Tailnet-pinned audits" };
  }
  if (route.proxyjump && route.proxyjump.toLowerCase() !== "none") {
    return { ...base, connected: false, viaTailnet: false, error: "ProxyJump is not allowed for Tailnet-pinned audits" };
  }

  const pinnedAddress = await verifiedTailnetAddress(route.hostname, tailnet);
  if (!pinnedAddress) {
    return { ...base, viaTailnet: false, connected: false, error: "SSH alias does not resolve to a node in the active Tailscale network" };
  }

  const remoteCommand = host.platform === "windows" ? WINDOWS_STATUS_COMMAND : UNIX_STATUS_COMMAND;
  const result = await run("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", `HostName=${pinnedAddress}`,
    "-o", "CanonicalizeHostname=no",
    "-o", "ProxyCommand=none",
    "-o", "ProxyJump=none",
    "--", host.sshAlias, remoteCommand,
  ], 15_000);
  if (result.code !== 0) {
    return { ...base, viaTailnet: true, connected: false, error: compactError(result.stderr || result.stdout) };
  }
  return { ...base, viaTailnet: true, connected: true, ...parseHerdrOutput(result.stdout) };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
  return results;
}

function formatTable(report) {
  const headers = ["Machine", "SSH alias", "Tailnet", "SSH", "Herdr", "Server", "Compatible", "Attach", "Blocker"];
  const rows = report.hosts.map((host) => [
    host.name,
    host.sshAlias,
    host.viaTailnet ? "yes" : "no",
    host.connected ? "ok" : "failed",
    !host.connected ? "-" : host.installed ? host.clientVersion : "missing",
    host.serverStatus || "-",
    host.compatible || "-",
    host.remoteAttachSupported ? "yes" : "unsupported",
    host.error ? `${host.error.slice(0, 77)}${host.error.length > 77 ? "…" : ""}` : "-",
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index]).length)));
  const line = (row) => row.map((cell, index) => String(cell).padEnd(widths[index])).join("  ").trimEnd();
  return [line(headers), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await loadConfig(options.config);
  const tailnet = await loadTailnet();
  let hosts = config.hosts;
  if (options.target) hosts = hosts.filter((host) => host.name === options.target || host.sshAlias === options.target);
  if (options.target && hosts.length === 0) throw new Error(`Unknown fleet target: ${options.target}`);

  const audited = await mapLimit(hosts, CONCURRENCY, (host) => auditHost(host, tailnet));
  const report = { backendState: tailnet.backendState, tailnetEnforced: true, hosts: audited };
  report.summary = formatTable(report);
  console.log(options.json ? JSON.stringify(report, null, 2) : report.summary);
}

main().catch((error) => {
  console.error(`herdr-tailnet-status: ${error.message}`);
  process.exit(1);
});
