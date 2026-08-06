export type PluginRecord = {
  plugin_id?: string;
  version?: string;
  min_herdr_version?: string;
  enabled?: boolean;
  plugin_root?: string;
  source?: { resolved_commit?: string; ref?: string };
};

export const REQUIRED_PLUGINS = [
  {
    id: "chmarax.gitview",
    repo: "ChmaraX/herdr-gitview",
    minHerdrVersion: "0.7.0",
    actions: ["chmarax.gitview.toggle"],
  },
  {
    id: "chmarax.herdr-nvim",
    repo: "ChmaraX/herdr-nvim",
    minHerdrVersion: "0.7.4",
    actions: ["chmarax.herdr-nvim.toggle", "chmarax.herdr-nvim.pick-file"],
  },
] as const;

export const REQUIRED_BINDINGS = [
  { key: "prefix+e", command: "chmarax.herdr-nvim.toggle", description: "nvim sidebar" },
  { key: "prefix+o", command: "chmarax.herdr-nvim.pick-file", description: "open file from agent output" },
  { key: "cmd+g", command: "chmarax.gitview.toggle", description: "git view" },
] as const;

export function parseVersion(value: string): number[] {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : [];
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left.length || !right.length) return 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function parsePluginRegistry(raw: string): PluginRecord[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PluginRecord => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const record = item as Record<string, unknown>;
      if (record.plugin_id !== undefined && typeof record.plugin_id !== "string") return false;
      if (record.plugin_root !== undefined && typeof record.plugin_root !== "string") return false;
      if (record.min_herdr_version !== undefined && typeof record.min_herdr_version !== "string") return false;
      if (record.source !== undefined && (!record.source || typeof record.source !== "object" || Array.isArray(record.source))) return false;
      const source = record.source as Record<string, unknown> | undefined;
      if (source?.resolved_commit !== undefined && typeof source.resolved_commit !== "string") return false;
      return source?.ref === undefined || typeof source.ref === "string";
    });
  } catch {
    return [];
  }
}

export function missingBindingCommands(config: string): string[] {
  const bindings = parseKeyCommandBlocks(config);
  return REQUIRED_BINDINGS
    .filter((required) => !bindings.some((binding) =>
      binding.type === "plugin_action" && binding.key === required.key && binding.command === required.command,
    ))
    .map(({ command }) => command);
}

export function appendMissingBindings(config: string): string {
  const missing = new Set(missingBindingCommands(config));
  if (!missing.size) return config;
  const blocks = REQUIRED_BINDINGS.filter(({ command }) => missing.has(command)).map(
    ({ key, command, description }) =>
      `[[keys.command]]\nkey = "${key}"\ntype = "plugin_action"\ncommand = "${command}"\ndescription = "${description}"`,
  );
  const normalized = config.trimEnd();
  return `${normalized}${normalized ? "\n\n" : ""}# Added by pi-herdr-doctor\n${blocks.join("\n\n")}\n`;
}

export function parseIntegrationStatus(raw: string): Array<{ name: string; state: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.match(/^([a-z0-9-]+):\s+(.+)$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1],
      state: match[2].replace(/\s+\((?:\/|[A-Za-z]:\\\\).+\)$/, ""),
    }));
}

export function formatServerStatus(raw: string): string {
  try {
    const value = JSON.parse(raw) as { status?: unknown; version?: unknown; compatible?: unknown };
    const status = typeof value.status === "string" ? value.status : "unknown";
    const version = typeof value.version === "string" ? ` v${value.version}` : "";
    const compatible = value.compatible === false ? " (protocol incompatible)" : "";
    return `${status}${version}${compatible}`;
  } catch {
    return raw.split(/\r?\n/, 1)[0] || "unknown";
  }
}

function parseKeyCommandBlocks(config: string): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = [];
  let current: Record<string, string> | undefined;
  for (const rawLine of config.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (line === "[[keys.command]]") {
      if (current) blocks.push(current);
      current = {};
      continue;
    }
    if (line.startsWith("[[") || line.startsWith("[")) {
      if (current) blocks.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(["'])(.*?)\2\s*$/);
    if (match) current[match[1]] = match[3];
  }
  if (current) blocks.push(current);
  return blocks;
}

function stripTomlComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if ((character === '"' || character === "'") && line[index - 1] !== "\\") {
      quote = quote === character ? "" : quote || character;
    } else if (character === "#" && !quote) {
      return line.slice(0, index);
    }
  }
  return line;
}
