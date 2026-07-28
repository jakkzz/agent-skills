import { existsSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const helperScript = resolve(extensionDir, "../scripts/bookctl.py");
const python = process.env.ACADEMIC_BOOK_PYTHON || "python3";

type BookPayload = { ok: boolean; result?: any; error?: string };

function findRoot(start: string): string | undefined {
  let current = resolve(start);
  const filesystemRoot = parse(current).root;
  while (true) {
    if (existsSync(resolve(current, "BOOK_STATE.yaml"))) return current;
    if (current === filesystemRoot) return undefined;
    current = dirname(current);
  }
}

async function runBookctl(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  signal?: AbortSignal,
  explicitRoot?: string,
): Promise<BookPayload> {
  const root = explicitRoot || cwd;
  const result = await pi.exec(python, [helperScript, "--json", "--root", root, ...args], {
    cwd,
    timeout: 180_000,
    signal,
  });
  if (result.code !== 0) {
    let message = (result.stderr || result.stdout || "bookctl failed").trim();
    try {
      const parsed = JSON.parse(message) as BookPayload;
      message = parsed.error || message;
    } catch {
      // Keep the command's diagnostic.
    }
    throw new Error(message);
  }
  try {
    return JSON.parse(result.stdout) as BookPayload;
  } catch (error) {
    throw new Error(`bookctl returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function compactText(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  const truncated = truncateHead(serialized, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncated.truncated) return truncated.content;
  return `${truncated.content}\n\n[Output truncated to Pi's ${DEFAULT_MAX_LINES}-line/${DEFAULT_MAX_BYTES}-byte limit. Full research and validation artifacts remain in the book workspace.]`;
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: compactText(value) }],
    details: value,
  };
}

function message(ctx: any, text: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.hasUI) ctx.ui.notify(text, level);
  else (level === "error" ? console.error : console.log)(text);
}

async function refreshStatus(pi: ExtensionAPI, ctx: any, cwd = ctx.cwd) {
  const root = findRoot(cwd);
  if (!root) {
    if (ctx.hasUI) ctx.ui.setStatus("academic-book", undefined);
    return;
  }
  try {
    const payload = await runBookctl(pi, cwd, ["status"], undefined, root);
    const status = payload.result || {};
    const gate = status.current_gate === "approved" ? "✓" : status.current_gate === "delegated-ready" ? "→" : status.current_gate === "stale" ? "!" : "○";
    if (ctx.hasUI) {
      ctx.ui.setStatus(
        "academic-book",
        ctx.ui.theme.fg("accent", "Book") +
          ctx.ui.theme.fg("dim", ` ${status.chapter || "—"} · ${status.chapter_phase || "planning"} ${gate}`),
      );
    }
  } catch {
    if (ctx.hasUI) ctx.ui.setStatus("academic-book", ctx.ui.theme.fg("warning", "Book state error"));
  }
}

function parseChapterAndGate(args: string): { chapter?: string; gate?: string } {
  const [chapter, gate] = args.trim().split(/\s+/, 2);
  return { chapter: chapter || undefined, gate: gate || undefined };
}

export default function academicBookStudio(pi: ExtensionAPI) {
  pi.registerTool({
    name: "book_status",
    label: "Book Status",
    description: "Read the current Academic Book Studio project and chapter phase, approval gate, source counts, claims, and unresolved markers. Does not modify files.",
    promptSnippet: "Inspect persistent academic-book and chapter workflow state",
    promptGuidelines: [
      "Use book_status before academic-book work; respect approval_mode, brief/final human gates, and mandatory exception stops.",
    ],
    parameters: Type.Object({
      root: Type.Optional(Type.String({ description: "Book root or any path inside it; defaults to current directory" })),
      chapter: Type.Optional(Type.String({ description: "Optional chapter identifier such as chapter-01" })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const args = ["status"];
      if (params.chapter) args.push("--chapter", params.chapter);
      const payload = await runBookctl(pi, ctx.cwd, args, signal, params.root);
      return toolResult(payload.result);
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("book status")) + theme.fg("muted", args.chapter ? ` ${args.chapter}` : ""), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as any;
      if (!details) return new Text(theme.fg("warning", "No book state"), 0, 0);
      return new Text(
        `${theme.fg("success", "✓")} ${details.chapter || "book"} · ${details.chapter_phase || details.book_phase || "unknown"} · gate ${details.current_gate || "n/a"}`,
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "academic_search",
    label: "Academic Search",
    description: "Search OpenAlex, Crossref, Semantic Scholar, or the optional pinned Findpapers adapter. Saves a reproducible query ledger and normalized deduplicated JSONL. Metadata and abstracts are discovery evidence, not proof of full-text claim support. Output is truncated at Pi's normal limits.",
    promptSnippet: "Search scholarly metadata providers with a reproducible query ledger",
    promptGuidelines: [
      "Use academic_search only after the workflow authorizes a completed research plan, vary queries across perspectives, and never treat metadata, citation counts, snippets, or abstracts as full-text proof.",
    ],
    parameters: Type.Object({
      query: Type.String({ minLength: 2, description: "Scholarly search query" }),
      chapter: Type.String({ description: "Chapter identifier, such as chapter-01" }),
      providers: Type.Optional(
        Type.Array(StringEnum(["openalex", "crossref", "semantic-scholar", "findpapers"] as const), {
          minItems: 1,
          uniqueItems: true,
          description: "Providers; defaults to OpenAlex, Crossref, and Semantic Scholar",
        }),
      ),
      yearMin: Type.Optional(Type.Integer({ minimum: 1000, maximum: 2200 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, description: "Maximum results per provider" })),
      root: Type.Optional(Type.String({ description: "Book root or any path inside it" })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Searching scholarly providers…" }], details: {} });
      const providers = params.providers || ["openalex", "crossref", "semantic-scholar"];
      const args = [
        "search",
        "--chapter",
        params.chapter,
        "--query",
        params.query,
        "--providers",
        providers.join(","),
        "--limit",
        String(params.limit || 25),
      ];
      if (params.yearMin) args.push("--year-min", String(params.yearMin));
      const payload = await runBookctl(pi, ctx.cwd, args, signal, params.root);
      const result = payload.result || {};
      const compact = {
        chapter: result.chapter,
        query: result.query,
        providers: result.providers,
        raw_records: result.raw_records,
        deduplicated_records: result.deduplicated_records,
        errors: result.errors,
        result_path: result.result_path,
        ledger_path: result.ledger_path,
        top_records: (result.records || []).slice(0, 10),
      };
      await refreshStatus(pi, ctx);
      return toolResult(compact);
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("academic search ")) + theme.fg("accent", `“${args.query}”`), 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching…"), 0, 0);
      const details = result.details as any;
      return new Text(
        theme.fg("success", `${details?.deduplicated_records ?? 0} deduplicated records`) +
          (details?.errors?.length ? theme.fg("warning", ` · ${details.errors.length} provider error(s)`) : ""),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "evidence_search",
    label: "Evidence Search",
    description: "Search local, page-anchored evidence notes imported into the Academic Book Studio workspace. Does not search raw private source files or external services.",
    promptSnippet: "Search locally reviewed academic evidence notes",
    promptGuidelines: [
      "Use evidence_search for drafting claims from local reviewed evidence; if no match exists, mark an evidence gap instead of relying on model memory.",
    ],
    parameters: Type.Object({
      query: Type.String({ minLength: 2 }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      root: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const payload = await runBookctl(
        pi,
        ctx.cwd,
        ["evidence-search", "--query", params.query, "--limit", String(params.limit || 10)],
        signal,
        params.root,
      );
      return toolResult(payload.result);
    },
  });

  pi.registerTool({
    name: "claim_validate",
    label: "Claim Validate",
    description: "Read-only validation of the academic claim ledger: source existence, evidence strength, locators, duplicate claims, and bibliography keys.",
    promptSnippet: "Validate source grounding for registered academic claims",
    promptGuidelines: [
      "Use claim_validate before presenting an academic chapter as verified or final; blocking findings must be fixed or explicitly left for human review.",
    ],
    parameters: Type.Object({ root: Type.Optional(Type.String()) }),
    async execute(_id, params, signal, _update, ctx) {
      const payload = await runBookctl(pi, ctx.cwd, ["claim-validate"], signal, params.root);
      return toolResult(payload.result);
    },
  });

  pi.registerTool({
    name: "book_consistency",
    label: "Book Consistency",
    description: "Read-only cross-chapter audit for unresolved markers, broken chapter references, duplicate headings or claims, and missing citation keys.",
    promptSnippet: "Audit final chapters for cross-book consistency",
    promptGuidelines: [
      "Use book_consistency before book export and after chapter-level verification; do not silently rewrite chapters to resolve findings.",
    ],
    parameters: Type.Object({ root: Type.Optional(Type.String()) }),
    async execute(_id, params, signal, _update, ctx) {
      const payload = await runBookctl(pi, ctx.cwd, ["consistency"], signal, params.root);
      return toolResult(payload.result);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await refreshStatus(pi, ctx);
  });

  pi.registerCommand("book-init", {
    description: "Initialize an academic-book workspace with minimal or stage-gated approval",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        message(ctx, "book-init requires interactive UI", "error");
        return;
      }
      const title = await ctx.ui.input("Book title", "Academic book title");
      if (!title) return;
      const field = await ctx.ui.input("Academic field", "e.g. higher education");
      if (!field) return;
      const audience = await ctx.ui.input("Intended readers", "e.g. university instructors and graduate students");
      if (!audience) return;
      const bookType = await ctx.ui.select("Book type", ["academic-textbook", "research-monograph", "practitioner-book", "literature-review", "edited-volume"]);
      if (!bookType) return;
      const citationStyle = await ctx.ui.input("Citation style", "apa");
      if (!citationStyle) return;
      const chapterTitle = await ctx.ui.input("Chapter 1 title", "Introduction");
      if (!chapterTitle) return;
      const formats = await ctx.ui.input("Output formats (comma separated)", "markdown,docx,pdf,epub");
      if (!formats) return;
      const privacy = await ctx.ui.select("Source privacy mode", ["local-only", "approved-apis", "cloud-processing-allowed"]);
      if (!privacy) return;
      const approvalMode = await ctx.ui.select("Human approval frequency", ["minimal", "stage-gated"]);
      if (!approvalMode) return;
      const target = args.trim() ? resolve(ctx.cwd, args.trim()) : ctx.cwd;
      try {
        const payload = await runBookctl(
          pi,
          ctx.cwd,
          [
            "init",
            "--title",
            title,
            "--field",
            field,
            "--audience",
            audience,
            "--book-type",
            bookType,
            "--citation-style",
            citationStyle,
            "--chapter-title",
            chapterTitle,
            "--formats",
            formats,
            "--privacy-mode",
            privacy,
            "--approval-mode",
            approvalMode,
          ],
          undefined,
          target,
        );
        message(ctx, `Academic book initialized: ${payload.result?.root || target}`);
        await refreshStatus(pi, ctx, target);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("book-status", {
    description: "Show Academic Book Studio state",
    handler: async (args, ctx) => {
      try {
        const command = ["status"];
        if (args.trim()) command.push("--chapter", args.trim());
        const payload = await runBookctl(pi, ctx.cwd, command, ctx.signal);
        message(ctx, compactText(payload.result));
        await refreshStatus(pi, ctx);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("chapter-create", {
    description: "Create a chapter workspace: /chapter-create <title>",
    handler: async (args, ctx) => {
      const title = args.trim() || (ctx.hasUI ? await ctx.ui.input("Chapter title", "New chapter") : undefined);
      if (!title) return;
      try {
        const payload = await runBookctl(pi, ctx.cwd, ["chapter-create", "--title", title], ctx.signal);
        message(ctx, `Created ${payload.result?.chapter}: ${payload.result?.title}`);
        await refreshStatus(pi, ctx);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("chapter-approve", {
    description: "Human approval for a chapter gate: /chapter-approve [chapter] [gate]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        message(ctx, "chapter-approve requires interactive human confirmation", "error");
        return;
      }
      try {
        const parsed = parseChapterAndGate(args);
        const statusPayload = await runBookctl(pi, ctx.cwd, ["status", ...(parsed.chapter ? ["--chapter", parsed.chapter] : [])], ctx.signal);
        const current = statusPayload.result || {};
        const chapter = parsed.chapter || current.chapter;
        const gate = current.chapter_phase;
        if (!chapter || !gate) throw new Error("Unable to determine chapter and current gate");
        if (current.approval_mode === "minimal" && !["brief", "final"].includes(gate)) {
          throw new Error(`No human approval is required at ${gate} in minimal mode; continue the delegated workflow`);
        }
        if (parsed.gate && parsed.gate !== gate) {
          throw new Error(`Only the current gate may be approved: ${gate}`);
        }
        const approvedBy = await ctx.ui.input("Approver name", process.env.USER || "Jakkrit");
        if (!approvedBy) return;
        const notes = await ctx.ui.input("Approval notes", "Approved after human review");
        const confirmed = await ctx.ui.confirm(
          "Approve academic artifact?",
          `${chapter} · ${gate}\nArtifact: ${current.current_artifact || "canonical gate artifact"}\nSHA-256: ${current.current_artifact_sha256 || "unavailable"}\n\nAny later change will make this and all dependent approvals stale.`,
        );
        if (!confirmed) return;
        const payload = await runBookctl(
          pi,
          ctx.cwd,
          ["approve", "--chapter", chapter, "--gate", gate, "--approved-by", approvedBy, "--notes", notes || ""],
          ctx.signal,
        );
        message(ctx, `Approved ${chapter} · ${gate}\nSHA-256: ${payload.result?.sha256}`);
        await refreshStatus(pi, ctx);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("chapter-next", {
    description: "Move a chapter to its next complete/approved phase: /chapter-next [chapter]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        message(ctx, "chapter-next requires interactive human confirmation", "error");
        return;
      }
      try {
        const statusPayload = await runBookctl(pi, ctx.cwd, ["status", ...(args.trim() ? ["--chapter", args.trim()] : [])], ctx.signal);
        const current = statusPayload.result || {};
        const next = current.next_phase;
        if (!next) throw new Error(`No next phase after ${current.chapter_phase}`);
        const confirmed = await ctx.ui.confirm("Advance chapter phase?", `${current.chapter}: ${current.chapter_phase} → ${next}`);
        if (!confirmed) return;
        await runBookctl(pi, ctx.cwd, ["transition", "--chapter", current.chapter, "--to", next], ctx.signal);
        message(ctx, `${current.chapter} advanced to ${next}`);
        await refreshStatus(pi, ctx);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("chapter-reopen", {
    description: "Return a chapter to an earlier phase and invalidate downstream approvals: /chapter-reopen [chapter]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        message(ctx, "chapter-reopen requires interactive human confirmation", "error");
        return;
      }
      try {
        const statusPayload = await runBookctl(pi, ctx.cwd, ["status", ...(args.trim() ? ["--chapter", args.trim()] : [])], ctx.signal);
        const current = statusPayload.result || {};
        const targets = current.reopen_targets || [];
        if (!targets.length) throw new Error(`${current.chapter || "Chapter"} has no earlier phase to reopen`);
        const target = await ctx.ui.select("Reopen at phase", targets);
        if (!target) return;
        const confirmed = await ctx.ui.confirm(
          "Reopen academic chapter?",
          `${current.chapter}: ${current.chapter_phase} → ${target}\nFinal approval must be renewed; minimal mode keeps the brief mandate unless its artifact changes.`,
        );
        if (!confirmed) return;
        await runBookctl(pi, ctx.cwd, ["reopen", "--chapter", current.chapter, "--to", target], ctx.signal);
        message(ctx, `${current.chapter} reopened at ${target}`, "warning");
        await refreshStatus(pi, ctx);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("source-import", {
    description: "Import a private local source: /source-import <path>",
    handler: async (args, ctx) => {
      const path = args.trim();
      if (!path) {
        message(ctx, "Usage: /source-import <path>", "warning");
        return;
      }
      if (ctx.hasUI) {
        const confirmed = await ctx.ui.confirm("Import private source?", `Copy locally into the book evidence workspace:\n${path}`);
        if (!confirmed) return;
      }
      try {
        const payload = await runBookctl(pi, ctx.cwd, ["source-import", path], ctx.signal);
        message(ctx, `Source ${payload.result?.status}: ${payload.result?.source_id || path}`);
        await refreshStatus(pi, ctx);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("evidence-approve", {
    description: "Record human-reviewed evidence: /evidence-approve <source-id>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        message(ctx, "evidence-approve requires interactive human confirmation", "error");
        return;
      }
      const sourceId = args.trim();
      if (!sourceId) {
        message(ctx, "Usage: /evidence-approve <source-id>", "warning");
        return;
      }
      const level = await ctx.ui.select("Evidence level", ["abstract", "full-text", "figure-or-table", "author-expertise"]);
      if (!level) return;
      const locator = await ctx.ui.input("Exact locator", "e.g. p. 14, Results, para. 3");
      if ((level === "full-text" || level === "figure-or-table") && !locator) return;
      const text = await ctx.ui.editor("Reviewed quotation or faithful paraphrase", "");
      if (!text?.trim()) return;
      const relation = await ctx.ui.select("Relation to the intended claim", ["supports", "contradicts", "qualifies", "contextualizes"]);
      if (!relation) return;
      const reviewedBy = await ctx.ui.input("Reviewer name", process.env.USER || "Jakkrit");
      if (!reviewedBy) return;
      const confirmed = await ctx.ui.confirm(
        "Record reviewed evidence?",
        `${sourceId} · ${level}\nLocator: ${locator || "author expertise"}\nReviewer: ${reviewedBy}`,
      );
      if (!confirmed) return;
      try {
        const payload = await runBookctl(
          pi,
          ctx.cwd,
          [
            "evidence-add",
            "--source-id",
            sourceId,
            "--level",
            level,
            "--locator",
            locator || "",
            "--text",
            text,
            "--relation",
            relation,
            "--reviewed-by",
            reviewedBy,
          ],
          ctx.signal,
        );
        message(ctx, `Evidence approved: ${payload.result?.evidence_id}`);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("claim-review", {
    description: "Record a human claim-support decision: /claim-review <claim-id>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        message(ctx, "claim-review requires interactive human confirmation", "error");
        return;
      }
      const claimId = args.trim();
      if (!claimId) {
        message(ctx, "Usage: /claim-review <claim-id>", "warning");
        return;
      }
      const support = await ctx.ui.select("Claim support decision", ["supported", "partial", "contradicted", "disputed", "unverifiable"]);
      if (!support) return;
      const reviewedBy = await ctx.ui.input("Reviewer name", process.env.USER || "Jakkrit");
      if (!reviewedBy) return;
      const notes = await ctx.ui.editor("Review notes", "");
      const confirmed = await ctx.ui.confirm("Record claim review?", `${claimId} · ${support}\nReviewer: ${reviewedBy}`);
      if (!confirmed) return;
      try {
        await runBookctl(
          pi,
          ctx.cwd,
          ["claim-review", "--claim-id", claimId, "--support", support, "--reviewed-by", reviewedBy, "--notes", notes || ""],
          ctx.signal,
        );
        message(ctx, `Claim reviewed: ${claimId} · ${support}`);
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("book-validate", {
    description: "Run final-readiness project, bibliography, evidence, claims, and consistency validation",
    handler: async (_args, ctx) => {
      try {
        const payload = await runBookctl(pi, ctx.cwd, ["validate"], ctx.signal);
        const result = payload.result || {};
        message(ctx, compactText(result), result.valid ? "info" : "warning");
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("book-export", {
    description: "Export canonical Markdown and optional Pandoc formats: /book-export [markdown,docx,pdf,epub,html]",
    handler: async (args, ctx) => {
      const tokens = args.trim() ? args.trim().split(/\s+/, 2) : [];
      const formats = tokens[0];
      const csl = tokens[1];
      if (ctx.hasUI) {
        const confirmed = await ctx.ui.confirm(
          "Export academic book?",
          `Formats: ${formats || "BOOK_STATE.yaml defaults"}${csl ? `\nCSL: ${csl}` : ""}\nCanonical chapter files will not be modified.`,
        );
        if (!confirmed) return;
      }
      try {
        const command = ["export"];
        if (formats) command.push("--formats", formats);
        if (csl) command.push("--csl", csl);
        const payload = await runBookctl(pi, ctx.cwd, command, ctx.signal);
        message(ctx, compactText(payload.result));
      } catch (error) {
        message(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
