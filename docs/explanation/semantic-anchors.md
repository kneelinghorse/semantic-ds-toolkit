# How Semantic Anchors Work

Semantic anchors are content-based fingerprints that identify columns by meaning rather than by name or position.

Key traits:
- Content-driven: computed from values, patterns, statistics
- Stable across schema evolution (renames, reorders)
- Carry confidence scores and evidence

Typical pipeline:
1. Compute fingerprints from sample rows
2. Match new columns to existing anchors by similarity and confidence
3. Reconcile differences and record drift

Related APIs: `StableColumnAnchorSystem`, `SmartAnchorReconciler`.

