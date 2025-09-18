# Anchor Storage Directory

This directory contains the persistent storage for Stable Column Anchors (SCAs).

## File Structure

```
semantics/anchors/
├── index.yml          # Dataset index mapping datasets to anchor IDs
├── 9a.yml            # Anchors with IDs starting with 'sca_9a'
├── 7b.yml            # Anchors with IDs starting with 'sca_7b'
└── ...               # Additional anchor files by ID prefix
```

## Anchor File Format

Each YAML file contains one or more anchors separated by `---`:

```yaml
anchor:
  dataset: "s3://raw/orders.parquet"
  column_name: "cust_id"
  anchor_id: "sca_9a7b..."
  fingerprint: "min=1|max=999999|dtype=int64|card=41234|null_ratio=0.002|unique_ratio=0.95|patterns=(^|_)(cust|customer|user|person)(_id)?$"
  first_seen: "2025-09-14"
  last_seen: "2025-09-14"
  mapped_cid: "identity.person"
  confidence: 0.93
---
anchor:
  dataset: "s3://raw/orders.parquet"
  column_name: "order_amount"
  anchor_id: "sca_9a8c..."
  fingerprint: "min=0.01|max=999999.99|dtype=float64|card=8234|null_ratio=0.001|unique_ratio=0.87|patterns=(^|_)(amount|price|cost|value)$"
  first_seen: "2025-09-14"
  last_seen: "2025-09-14"
  mapped_cid: "money.amount"
  confidence: 0.89
```

## Index File Format

The index.yml file maps datasets to their anchor IDs:

```yaml
datasets:
  - dataset: "s3://raw/orders.parquet"
    anchors:
      - sca_9a7b123...
      - sca_9a8c456...
  - dataset: "local://data/customers.csv"
    anchors:
      - sca_7b1a789...
```

## Performance Characteristics

- Files are organized by anchor ID prefix for efficient lookups
- Each file contains related anchors to minimize I/O operations
- The index enables fast dataset-based queries
- YAML format provides human readability and git-friendliness