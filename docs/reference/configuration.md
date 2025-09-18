# Configuration Reference

Central configuration lives in `semantic-config.yaml`.

## Inference

- `confidence_threshold` (number): Default minimum confidence for matches. Example: `0.7`.
- `auto_reconcile` (boolean): Enable automatic reconciliation of anchors. Example: `true`.
- `statistical_analysis` (boolean): Enable statistical analyzers. Example: `true`.
- `pattern_matching` (boolean): Enable pattern-based inference. Example: `true`.

## Anchors

- `storage_path` (string): Directory for anchor data. Example: `./anchors`.
- `backup_enabled` (boolean): Keep backups of anchor state.
- `versioning` (boolean): Enable anchor version metadata (enterprise templates).

## Evidence

- `persistence` (boolean): Persist evidence artifacts.
- `storage_path` (string): Directory for evidence.
- `replay_enabled` (boolean): Enable evidence replay features.

## Validation (optional)

- `strict_mode` (boolean): Fail on warnings.
- `schema_validation` (boolean): Validate against user schemas.
- `custom_rules` (string): Path to YAML file with extra rules.

## Performance (optional)

- `benchmarking` (boolean): Enable benchmark runs in health checks.
- `profiling` (boolean): Enable performance profiling.
- `drift_detection` (boolean): Enable drift detection.

## Drift Detection (optional)

- `enabled` (boolean)
- `thresholds.semantic_drift` (number): e.g., `0.1`
- `thresholds.statistical_drift` (number): e.g., `0.05`
- `alert_channels` (array): e.g., `["console"]`

## Data Types

List the input types you plan to use:

```yaml
data_types:
  - csv
  - json
```

Tip: Generate a starter config by running `semantic-ds init --interactive`.

