# Academic Book Studio

Academic Book Studio is a private, local-first Pi package for producing source-grounded academic books through reproducible research, explicit evidence mapping, versioned chapter drafts, independent review, and minimal human approval by default.

## Components

- Five portable Agent Skills describe the research, evidence, writing, and review methods.
- `extensions/academic-book-studio.ts` supplies bounded Pi tools, human commands, and a compact status indicator.
- `scripts/bookctl.py` is the portable source-checkout entry point.
- `academic-book-core/` is the deterministic Python SSOT for state, gates, search normalization, citation validation, claim validation, consistency, and export. JSON Schemas are interoperability projections; tests require their enums and required constructor fields to match the runtime authority.
- `prompts/` contains repeatable chapter-production prompts.

The extension delegates to `bookctl`; it does not duplicate state transitions in TypeScript.

## Quick start

In Pi:

```text
/book-init ~/writing/my-book
```

Or from a source checkout:

```bash
python3 scripts/bookctl.py --json --root ~/writing/my-book init \
  --title "My Academic Book" \
  --field "Higher education" \
  --audience "University instructors and graduate students" \
  --formats markdown,docx,pdf,epub
```

Status:

```text
/book-status
```

```bash
python3 scripts/bookctl.py --json --root ~/writing/my-book status
```

### Nested workspace discovery

Commands and the Pi status/approval adapter first search the supplied/current path and its parents for `BOOK_STATE.yaml`. If that fails, the deterministic core searches up to six directory levels below the nearest repository root (or the supplied directory when no repository is present). Exactly one nested workspace is selected automatically. This supports a book stored at a path such as `references/drone/academic-book` while Pi runs at the owning repository root.

Discovery fails closed when multiple nested books exist and asks for an exact `--root`; it never chooses one by name or recency. Hidden directories, caches, build outputs, dependency/vendor directories, and symlinks are excluded, and the scan has a directory limit. The TypeScript extension delegates this decision to `bookctl` so `/book-status` and `/chapter-approve` use the same root-selection authority as CLI and tools.

## Phase model

Each chapter moves through:

```text
brief
→ research-plan
→ source-selection
→ outline
→ sample
→ draft-v1
→ review
→ revision-plan
→ draft-v2
→ verification
→ final
```

The default `minimal` approval mode asks for only two chapter-phase approvals: the brief mandate and the complete final packet. Intermediate phases still run in order and refuse scaffolded, unresolved, or incomplete artifacts, but may advance under the mandate without routine approval prompts. Human evidence/claim decisions are consolidated into one packet instead of requested record by record. Final approval is bound to a manifest containing every canonical phase artifact and all seven independent review reports, so any later packet change makes it stale. Mandatory exception stops remain for scope, privacy, rights, disputed evidence, ethics, author expertise, waivers, and blocking findings. `stage-gated` mode preserves approval at every phase. Approval and reopening require human UI confirmation; no model-callable approval tool exists. `/chapter-approve` presents one hash-bound confirmation and records the configured identity and standard note without separate text prompts. The identity defaults to `$USER` and may be overridden with `ACADEMIC_BOOK_APPROVER`; the standard note may be overridden with `ACADEMIC_BOOK_APPROVAL_NOTES`. Both values are shown in the confirmation dialog before writing the approval.

## Research backends

Built-in zero-dependency metadata clients:

- OpenAlex
- Crossref
- Semantic Scholar

Optional adapter:

- Findpapers, pinned to `e0916d049fdcf5c1d5bc75abc6f85d7ce360d21a`

Environment variables:

```text
OPENALEX_EMAIL
OPENALEX_KEY
CROSSREF_EMAIL
SEMANTIC_SCHOLAR_API_KEY
```

Searches save both a normalized JSONL result and a query ledger under `research/searches/`. Each invocation receives an immutable UUID-backed operation ID. Provider failures are recorded instead of silently discarded. Results are deduplicated by DOI, then normalized title and year.

External search is blocked while `privacy_mode` is `local-only`. The chapter must reach `source-selection`. Minimal mode requires a current brief mandate and hashes the completed research plan into each search ledger; stage-gated mode requires the research-plan approval chain to remain current.

Install the reviewed optional Findpapers adapter from `academic-book-core/`:

```bash
uv sync --extra findpapers
```

From that same `academic-book-core/` directory, point the extension at the environment:

```bash
export ACADEMIC_BOOK_PYTHON="$PWD/.venv/bin/python"
```

## Zotero and BibTeX

Recommended flow:

```text
Zotero → Better BibTeX automatic export → bibliography/library.bib
```

The core reads but does not mutate Zotero. `bib-validate` reports malformed entries, duplicate keys, duplicate DOIs, and missing title/author/year. Export writes only cited entries to `bibliography/cited.bib`.

## Source evidence

`/source-import <path>` copies a private source into `research/sources/<source-id>/source-private.<ext>`, records its SHA-256 and rights-review state, and creates empty evidence artifacts. The whole `research/sources/` directory is ignored by default because metadata, filenames, quotations, and evidence can all be sensitive. A human may narrow that ignore rule after a privacy and rights review. Minimal approval never delegates private external processing or permission waivers.

Import establishes only `full-text-local-unreviewed` availability. It does not make the source claim-usable. `/evidence-approve <source-id>` records a human-reviewed quotation or faithful paraphrase, locator, relation, reviewer, evidence level, and source-content hash in `evidence.jsonl`. Final validation requires the managed source file to exist, match its SHA-256 metadata, and match every dependent evidence record.

Document extraction remains delegated to reviewed PDF/DOCX/PPTX tools. Evidence records must preserve exact page/section/figure/table locators and distinguish quotation from paraphrase. Documents and bibliographic fields are untrusted content, never executable instructions.

Evidence levels:

- `metadata-only`
- `search-snippet`
- `abstract`
- `full-text`
- `figure-or-table`
- `author-expertise`

## Claim ledger

`claims/claims.jsonl` holds atomic claims. Claims reference both source IDs and reviewed evidence IDs. `/claim-review <claim-id>` records the human support decision. `claim-validate` checks:

- required claim fields and unique IDs
- known chapters, sources, and evidence records
- evidence-to-source binding
- evidence-level inflation
- reviewed status for evidence and claims
- full-text/figure locators
- bibliography keys
- duplicate claim text

A valid DOI establishes identity only. Abstract verification is not full-text verification, and a locally imported but unreviewed full text remains metadata-only for claim validation. Claim review stores a digest of the claim fields, referenced evidence snapshots, support outcome, notes, reviewer, and review timestamp; later edits make the review stale. Contradicted or unverifiable claims block final readiness until rewritten or removed and reviewed again.

## Review and revision

Independent review files cover factual/citation, subject matter, structure, pedagogy, style/voice, academic integrity, and cross-chapter consistency. Reviewers write findings but do not edit drafts. The consolidated revision plan preserves reviewer disagreement. In minimal mode, objective within-brief corrections may proceed under delegation while subjective, scope-changing, disputed, rights, ethical, waiver, author-expertise, and blocking-finding decisions are batched for the human. Stage-gated mode requires human decisions before revision.

## Export

Markdown is canonical. `bookctl export` first runs final-readiness checks, requires every chapter to be in `final` with a current dependency-aware approval, combines approved `final.md` files into `build/book.md`, extracts parenthetical and textual Pandoc citation keys, and writes `bibliography/cited.bib`. Omitted formats come from `BOOK_STATE.yaml`.

Pandoc is required for DOCX, PDF, EPUB, and HTML:

```text
/book-export markdown,docx,pdf,epub,html
```

A derived export with a stored citation style such as `apa` requires an explicit reviewed CSL file; the exporter refuses to silently use Pandoc's default:

```bash
python3 scripts/bookctl.py --root <book> export --formats docx,pdf --csl style.csl
```

## Optional PaperQA2

PaperQA2 is declared as an optional extra but is not the evidence SSOT and is not invoked automatically:

```bash
uv sync --extra paperqa
```

Adopt it only after a corpus benchmark demonstrates that semantic retrieval improves evidence selection. Any retrieved evidence must still be normalized into the book's source and claim records.

## Privacy and rights

Workspace privacy modes:

- `local-only`
- `approved-apis`
- `cloud-processing-allowed`

The mode is a declared policy, not automatic legal consent. A human must still approve specific external handling of private full text. The system does not bypass paywalls, issue copyright clearance, or automatically publish.

## Validation

```bash
python3 -m unittest discover -s academic-book-core/tests -v
python3 scripts/bookctl.py --json --root <book> validate
```

During work, use `validate --workspace-only`. Final `validate` is a readiness gate requiring final phase and approvals. The report combines project structure, bibliography, structured evidence, claims, unresolved markers, broken chapter references, duplicate headings/claims, and citation resolution. Add `--fail-on-findings` for CI exit status 3.

## Limitations

Academic Book Studio cannot guarantee scholarly truth, replace domain expertise or peer review, determine legal permission, access every source, or preserve personal voice without human calibration. It is designed to make evidence and decisions traceable and to fail visibly when they are not.
