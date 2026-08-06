---
description: Run independent evidence-anchored review lanes on an academic chapter draft
argument-hint: "<chapter> [draft-v1|draft-v2]"
---
Load `academic-book-project` and `academic-book-review`.

Review ${1:-the current chapter}, target ${2:-draft-v1}.

Lock the exact target path and hash. Run independent factual/citation, subject-matter, structural, pedagogical, style/voice, academic-integrity, and cross-chapter lanes. Reviewers must not edit the draft. Every finding needs an ID, severity, exact location or quote, rationale, recommendation, and confidence. Consolidate duplicates while preserving disagreements. In minimal mode, disposition objective within-brief corrections as delegated and batch only subjective, scope, privacy, rights, disputed-evidence, ethics, waiver, author-expertise, or blocking decisions for the human. In stage-gated mode, leave all human decision fields pending. Never approve the review yourself.
