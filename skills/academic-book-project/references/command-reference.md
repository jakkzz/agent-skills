# `bookctl` Command Reference

Source-checkout invocation:

```bash
python3 "$SKILL_DIR/../../scripts/bookctl.py" --json --root <book-or-containing-repository> <command>
```

`--root` may name the exact book, a path inside it, or a parent repository containing exactly one `BOOK_STATE.yaml` within six directory levels. Parent/ancestor lookup remains first. Unique descendant discovery skips hidden/cache/build/vendor directories and symlinks. If more than one nested book is found, `bookctl` fails closed and lists candidates; pass one exact book root.

## Project and gates

```text
init --title --field --audience [--book-type] [--citation-style] [--chapter-title] [--formats] [--privacy-mode] [--approval-mode minimal|stage-gated]
chapter-create --title [--chapter]
status [--chapter]
approve --chapter --gate --approved-by [--notes]
transition --chapter --to
reopen --chapter --to
validate [--workspace-only] [--write-report]
adapter-status
```

Only a human-facing command should invoke `approve`. Never call it autonomously. In `minimal` mode, `approve` is valid only at `brief` and `final`; the agent may invoke `transition` for complete intermediate artifacts. `stage-gated` preserves the legacy approval requirement at every phase.

## Research and sources

```text
search --chapter --query [--providers] [--limit] [--year-min]
source-import <path> [--source-id] [--citation-key]
evidence-add --source-id --level --locator --text --reviewed-by [--relation] [--evidence-id]
evidence-search --query [--limit]
evidence-validate
doi-verify <doi> [--title] [--first-author] [--year]
```

Default providers are OpenAlex, Crossref, and Semantic Scholar. Optional provider: `findpapers`.

## Bibliography and claims

```text
bib-validate [--path bibliography/library.bib]
claim-add --chapter --section --claim --type --evidence-level [--source-ids] [--evidence-ids] [--citation-keys] [--locator] [--claim-id]
claim-review --claim-id --support --reviewed-by [--notes]
claim-validate
consistency [--write-report]
```

## Export

```text
export [--formats markdown,docx,pdf,epub,html] [--csl path/to/style.csl]
```

Omitted formats come from `BOOK_STATE.yaml`. Markdown is canonical. Derived formats require Pandoc. A non-default stored citation style requires an explicit reviewed CSL file. Export requires every chapter to be final with a current approval, writes `build/book.md` and filtered `bibliography/cited.bib`, and never overwrites chapter source files.

## Optional adapters

Install from the core directory only after source review:

```bash
cd academic-book-core
uv sync --extra findpapers
uv sync --extra paperqa
export ACADEMIC_BOOK_PYTHON="$PWD/.venv/bin/python"
```

Findpapers is pinned to commit `e0916d049fdcf5c1d5bc75abc6f85d7ce360d21a`. PaperQA2 is optional and must not become the project evidence SSOT.
