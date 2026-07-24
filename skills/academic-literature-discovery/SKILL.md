---
name: academic-literature-discovery
description: Plan and execute reproducible scholarly literature discovery for an academic book chapter using OpenAlex, Crossref, Semantic Scholar, and optional pinned Findpapers. Use for research questions, query matrices, paper searches, source shortlisting, citation snowballing, bibliography discovery, or literature landscapes. Discovery metadata is not treated as proof of claim support.
compatibility: Python 3.11+; network access; optional provider API keys and Findpapers extra.
---

# Academic Literature Discovery

## Preconditions

1. Load `academic-book-project` and inspect book/chapter state.
2. Complete and approve `research-plan.md`, then transition to `source-selection` before any external search.
3. Confirm `privacy_mode` is `approved-apis` or `cloud-processing-allowed`; `local-only` blocks external providers in the deterministic core.
4. If later work exposes an evidence gap, the human must explicitly reopen research and preserve the new query ledger.

## Research plan

Write `chapters/<chapter>/research-plan.md` with:

- chapter questions and subquestions
- terminology, synonyms, older terms, and exclusions
- historical, theoretical, empirical, critical, and practical perspectives
- claims likely to require full-text evidence
- source-type priorities
- inclusion/exclusion criteria
- language and date limits
- planned providers and known coverage gaps
- privacy/API consent assumptions

Do not draft chapter prose while planning research.

## Search

Use several complementary queries, not superficial paraphrases of one query. Prefer `academic_search`; CLI equivalent:

```bash
python3 "$SKILL_DIR/../../scripts/bookctl.py" --json --root <book> search \
  --chapter chapter-01 \
  --query '<query>' \
  --providers openalex,crossref,semantic-scholar \
  --limit 25 --year-min 2020
```

Use optional `findpapers` only when installed and when its broader multi-database translation or citation snowballing adds value. It is pinned by the package metadata; do not install from a moving branch ad hoc.

## Selection

For each candidate record assess separately:

- topical relevance
- primary versus secondary source
- peer-reviewed, preprint, report, book, chapter, or dataset
- methodology fit
- recency where relevant
- foundational influence where relevant
- full-text availability
- retraction or correction signals
- supporting, contradicting, or contextual role

Citation count is an influence signal, never a truth score. Search result snippets and abstracts may justify selection for reading but not strong chapter claims.

Write selected sources to `source-map.yaml`; preserve rejected candidates and reasons in research notes so the search is auditable.

## Snowballing

Use approved seed papers. Keep depth bounded, normally one level. Search both references and citing works where useful. Record the seed, direction, provider, limits, and date.

## Human gate

Stop after producing the source shortlist. Ask the author to approve `source-map.yaml` before full-text extraction or outlining.

See the project skill's [evidence policy](../academic-book-project/references/evidence-policy.md).
