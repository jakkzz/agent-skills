# Independent Review Contracts

## Shared finding schema

```yaml
id: FACT-001
severity: blocking | important | optional
location: section, paragraph, line, or exact quote
problem: falsifiable description
rationale: why this matters
sources_or_rules: evidence used by reviewer
recommendation: bounded correction
confidence: high | medium | low
```

Reviewers must not edit the source draft. LLM findings need exact anchors. Deterministic findings should identify the script/report that produced them.

## Factual and citation reviewer

Trace claims to claim IDs, source IDs, and locators. Check scope, population, methods, uncertainty, numerical fidelity, retractions/corrections, and whether the evidence level is strong enough.

## Subject-matter reviewer

Test definitions, disciplinary framing, competing schools, consensus, historical context, causal reasoning, and overgeneralization. State domain uncertainty rather than performing expertise.

## Structural reviewer

Build a claim/premise map. Find missing premises, circular structure, disconnected sections, duplicate explanations, weak transitions, and promises not closed by the conclusion.

## Pedagogical reviewer

Compare to reader starting knowledge and learning objectives. Check prerequisites, terminology, examples, cognitive load, exercises, misconceptions, and whether the chapter teaches rather than merely summarizes.

## Style and voice reviewer

Use the declared style guide. Flag voice drift, jargon, filler, paragraph monotony, citation placement, and inappropriate hedging. Do not use an aggregate “AI writing score” or erase intentional author voice.

## Academic-integrity reviewer

Check attribution, paraphrase distance, quotation locators, fabricated or mismatched references, excessive quotation, permissions, and privacy. Do not accuse; report evidence and uncertainty.

## Cross-chapter reviewer

Check terminology, notation, concept introduction order, duplication, contradictions, broken references, example reuse, and whether book-level promises are fulfilled.

## Consolidator

Merge duplicates, retain disagreements, rank severity, and create decision fields. The consolidator cannot approve its own recommendations.
