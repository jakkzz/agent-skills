---
description: Research an authorized academic-book chapter with reproducible scholarly discovery
argument-hint: "<chapter> [topic or focus]"
---
Load the `academic-book-project` and `academic-literature-discovery` skills.

Research ${1:-the current chapter}. Focus: ${@:2}.

First inspect persistent state and `approval_mode`. Build or refine the research plan before searching. Use varied scholarly queries across historical, theoretical, empirical, critical, and practical perspectives. Save query ledgers and normalized results. Distinguish metadata, snippets, abstracts, and full text. Do not draft prose. In minimal mode, validate and advance within the brief mandate unless an exception needs one batched human decision; in stage-gated mode, stop at the configured gate. End with the source shortlist, coverage gaps, provider errors, and any exact human decision still required.
