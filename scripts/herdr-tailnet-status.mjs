#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as dns } from "node:dns";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_CONFIG = resolve(homedir(), ".config/herdr-tailnet/fleet.json");
const MAX_BUFFER = 128 * 1024;
const VALID_ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
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
      throw new Error(`Fleet config not found: ${path}. Copy config/herdr-tailnet.example.json to this path and edit SSH aliases.`);
    }
    throw error;
  }
  const config = JSON.parse(raw);
  if (config.version !== 1 || !Array.isArray(config.hosts)) {
    throw new Error("Fleet config must contain version: 1 and a hosts array");
  }
  for (const host of config.hosts) {
    if (!host || typeof host.name !== "string" || typeof host.sshAlias !== "string") {
      throw new Error("Every fleet host needs string name and sshAlias fields");
    }
    if (!VALID_NAME.test(host.name)) throw new Error(`Unsafe fleet name: ${JSON.stringify(host.name)}`);
    if (!VALID_ALIAS.test(host.sshAlias)) throw new Error(`Unsafe SSH alias: ${host.sshAlias}`);
    if (!['unix', 'windows'].includes(host.platform)) throw new Error(`Unsupported platform for ${host.name}: ${host.platform}`);
  }
  return { requireTailnet: config.requireTailnet !== false, hosts: config.hosts };
}

async function loadTailnet() {
  const result = await run("tailscale", ["status", "--json"], 10_000);
  if (result.code !== 0) throw new Error(`tailscale status failed: ${result.stderr.trim()}`);
  const status = JSON.parse(result.stdout);
  const nodes = [status.Self, ...Object.values(status.Peer || {})].filter(Boolean);
  const ips = new Set(nodes.flatMap((node) => node.TailscaleIPs || []));
  const dnsNames = new Set(nodes.map((node) => String(node.DNSName || "").replace(/\.$/, "").toLowerCase()).filter(Boolean));
  return {
    backendState: status.BackendState,
    tailnet: status.CurrentTailnet?.Name,
    magicDnsSuffix: status.MagicDNSSuffix || status.CurrentTailnet?.MagicDNSSuffix,
    nodes,
    ips,
    dnsNames,
  };
}

function parseSshConfig(stdout) {
  const values = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^(hostname|user|port)\s+(.+)$/i);
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

const UNIX_STATUS_COMMAND = String.raw`bin=""; for candidate in "$(command -v herdr 2>/dev/null || true)" "$HOME/.local/bin/herdr" /opt/homebrew/bin/herdr /usr/local/bin/herdr; do if [ -n "$candidate" ] && [ -x "$candidate" ]; then bin="$candidate"; break; fi; done; if [ -z "$bin" ]; then echo __HERDR_MISSING__; exit 0; fi; echo __HERDR_BIN__="$bin"; "$bin" --version; "$bin" status server`;
const WINDOWS_STATUS_COMMAND = String.raw`cmd.exe /d /s /c "where herdr >nul 2>nul && (echo __HERDR_BIN__=herdr & herdr --version & herdr status server) || echo __HERDR_MISSING__"`;

function parseHerdrOutput(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const missing = lines.includes("__HERDR_MISSING__");
  const clientLine = lines.find((line) => /^herdr\s+/i.test(line));
  const value = (key) => lines.find((line) => line.toLowerCase().startsWith(`${key}:`))?.split(":").slice(1).join(":").trim();
  return {
    installed: !missing && Boolean(clientLine),
    binary: lines.find((line) => line.startsWith("__HERDR_BIN__="))?.slice("__HERDR_BIN__=".length),
    clientVersion: clientLine?.replace(/^herdr\s+/i, ""),
    serverStatus: value("status") || (missing ? "missing" : "unknown"),
    serverVersion: value("version"),
    protocol: value("protocol"),
    compatible: value("compatible"),
    socket: value("socket"),
  };
}

function compactError(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function auditHost(host, tailnet, requireTailnet) {
  const base = { name: host.name, sshAlias: host.sshAlias, platform: host.platform };
  const sshConfig = await run("ssh", ["-G", host.sshAlias], 5_000);
  if (sshConfig.code !== 0) return { ...base, connected: false, viaTailnet: false, error: compactError(sshConfig.stderr) };

  const route = parseSshConfig(sshConfig.stdout);
  const routeAddresses = await resolveHost(route.hostname);
  const normalizedHost = String(route.hostname || "").replace(/\.$/, "").toLowerCase();
  const viaTailnet = routeAddresses.some((ip) => tailnet.ips.has(ip)) || tailnet.dnsNames.has(normalizedHost);
  const routeInfo = { hostname: route.hostname, user: route.user, port: route.port, addresses: routeAddresses };

  if (requireTailnet && !viaTailnet) {
    return { ...base, route: routeInfo, viaTailnet: false, connected: false, error: "SSH alias does not resolve to a node in the active Tailscale network" };
  }

  const remoteCommand = host.platform === "windows" ? WINDOWS_STATUS_COMMAND : UNIX_STATUS_COMMAND;
  const result = await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host.sshAlias, remoteCommand], 15_000);
  if (result.code !== 0) {
    return { ...base, route: routeInfo, viaTailnet, connected: false, error: compactError(result.stderr || result.stdout) };
  }
  return { ...base, route: routeInfo, viaTailnet, connected: true, ...parseHerdrOutput(result.stdout) };
}

function formatTable(report) {
  const headers = ["Machine", "SSH alias", "Tailnet", "SSH", "Herdr", "Server", "Compatible", "Blocker"];
  const rows = report.hosts.map((host) => [
    host.name,
    host.sshAlias,
    host.viaTailnet ? "yes" : "no",
    host.connected ? "ok" : "failed",
    !host.connected ? "-" : host.installed ? host.clientVersion : "missing",
    host.serverStatus || "-",
    host.compatible || "-",
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

  const audited = await Promise.all(hosts.map((host) => auditHost(host, tailnet, config.requireTailnet)));
  const report = {
    configPath: options.config,
    tailnet: tailnet.tailnet,
    backendState: tailnet.backendState,
    requireTailnet: config.requireTailnet,
    hosts: audited,
  };
  report.summary = formatTable(report);
  console.log(options.json ? JSON.stringify(report, null, 2) : report.summary);
}

main().catch((error) => {
  console.error(`herdr-tailnet-status: ${error.message}`);
  process.exit(1);
});
