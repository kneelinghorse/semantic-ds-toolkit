# How-to: Integrate with dbt

*Task: Connect semantic anchors with your dbt workflow for automated data modeling*

## Quick Setup

### 1. Install dbt Semantic Package
```bash
# Add to packages.yml
packages:
  - git: "https://github.com/semantic-toolkit/dbt-semantic"
    revision: main

dbt deps
```

### 2. Configure Semantic Sources
Create `models/semantic/schema.yml`:
```yaml
version: 2

sources:
  - name: semantic_anchors
    description: "Semantic anchor metadata"
    tables:
      - name: column_anchors
        description: "Column fingerprints and semantic IDs"
        columns:
          - name: anchor_id
            description: "Unique anchor identifier"
          - name: dataset_path
            description: "Source dataset path"
          - name: column_name
            description: "Original column name"
          - name: cid
            description: "Semantic concept ID"
          - name: fingerprint
            description: "Content-based fingerprint"
          - name: confidence
            description: "Anchor confidence score"

      - name: drift_history
        description: "Schema and data drift tracking"
        columns:
          - name: dataset_path
          - name: column_name
          - name: drift_type
          - name: severity
          - name: detected_at
```

## Semantic-Aware Models

### 1. Auto-Generated Joins
Create `macros/semantic_join.sql`:
```sql
{% macro semantic_join(left_model, right_model, min_confidence=0.8) %}

  {% set anchor_query %}
    SELECT
      l.anchor_id as left_anchor_id,
      r.anchor_id as right_anchor_id,
      l.cid,
      l.dataset_path as left_dataset,
      r.dataset_path as right_dataset,
      l.column_name as left_column,
      r.column_name as right_column,
      LEAST(l.confidence, r.confidence) as join_confidence
    FROM {{ ref('semantic_anchors', 'column_anchors') }} l
    JOIN {{ ref('semantic_anchors', 'column_anchors') }} r
      ON l.cid = r.cid
      AND l.dataset_path = '{{ left_model }}'
      AND r.dataset_path = '{{ right_model }}'
      AND LEAST(l.confidence, r.confidence) >= {{ min_confidence }}
  {% endset %}

  {% set anchor_results = run_query(anchor_query) %}

  {% if anchor_results %}
    {% for row in anchor_results %}
      {% if loop.first %}
        WITH semantic_join AS (
          SELECT l.*, r.*
          FROM {{ ref(left_model) }} l
          JOIN {{ ref(right_model) }} r
      {% endif %}

      {% if loop.first %}
            ON l.{{ row[5] }} = r.{{ row[6] }}  -- First join condition
      {% else %}
            OR l.{{ row[5] }} = r.{{ row[6] }}  -- Additional join conditions
      {% endif %}

      {% if loop.last %}
        )
        SELECT * FROM semantic_join
      {% endif %}
    {% endfor %}
  {% else %}
    -- No semantic anchors found, return empty result
    SELECT * FROM {{ ref(left_model) }} WHERE 1=0
  {% endif %}

{% endmacro %}
```

### 2. Use Semantic Joins in Models
Create `models/marts/customer_orders.sql`:
```sql
{{ config(
    materialized='table',
    meta={
      'semantic_join': true,
      'join_confidence': 0.85
    }
) }}

-- Use semantic join macro
{{ semantic_join('staging_customers', 'staging_orders', min_confidence=0.85) }}
```

### 3. Schema Evolution Detection
Create `models/monitoring/schema_changes.sql`:
```sql
{{ config(materialized='view') }}

WITH current_schema AS (
  SELECT
    table_schema,
    table_name,
    column_name,
    data_type,
    is_nullable,
    current_timestamp() as captured_at
  FROM information_schema.columns
  WHERE table_schema = '{{ target.schema }}'
),

anchor_schema AS (
  SELECT
    dataset_path,
    column_name,
    SPLIT_PART(fingerprint, '|', 3) as expected_type  -- Extract dtype from fingerprint
  FROM {{ ref('semantic_anchors', 'column_anchors') }}
),

schema_drift AS (
  SELECT
    c.table_name,
    c.column_name,
    c.data_type as current_type,
    a.expected_type,
    CASE
      WHEN a.expected_type IS NULL THEN 'NEW_COLUMN'
      WHEN c.data_type != a.expected_type THEN 'TYPE_CHANGE'
      ELSE 'NO_CHANGE'
    END as drift_type
  FROM current_schema c
  FULL OUTER JOIN anchor_schema a
    ON c.table_name = SPLIT_PART(a.dataset_path, '.', -1)
    AND c.column_name = a.column_name
  WHERE drift_type != 'NO_CHANGE'
)

SELECT * FROM schema_drift
```

## Advanced dbt Integration

### 1. Semantic Tests
Create `macros/test_semantic_quality.sql`:
```sql
{% test semantic_drift_check(model, column_name) %}

  WITH anchor_info AS (
    SELECT fingerprint, confidence
    FROM {{ ref('semantic_anchors', 'column_anchors') }}
    WHERE dataset_path = '{{ model.name }}'
      AND column_name = '{{ column_name }}'
  ),

  current_stats AS (
    SELECT
      MIN({{ column_name }}) as min_val,
      MAX({{ column_name }}) as max_val,
      COUNT(DISTINCT {{ column_name }}) as cardinality,
      COUNT(*) as total_rows,
      SUM(CASE WHEN {{ column_name }} IS NULL THEN 1 ELSE 0 END) as null_count
    FROM {{ model }}
  ),

  expected_stats AS (
    SELECT
      SPLIT_PART(SPLIT_PART(fingerprint, '|', 1), '=', 2)::FLOAT as expected_min,
      SPLIT_PART(SPLIT_PART(fingerprint, '|', 2), '=', 2)::FLOAT as expected_max,
      SPLIT_PART(SPLIT_PART(fingerprint, '|', 4), '=', 2)::INT as expected_cardinality
    FROM anchor_info
  )

  SELECT *
  FROM current_stats c
  CROSS JOIN expected_stats e
  WHERE
    ABS(c.min_val - e.expected_min) / NULLIF(e.expected_min, 0) > 0.2  -- 20% deviation
    OR ABS(c.max_val - e.expected_max) / NULLIF(e.expected_max, 0) > 0.2
    OR ABS(c.cardinality - e.expected_cardinality) / NULLIF(e.expected_cardinality, 0) > 0.3

{% endtest %}
```

### 2. Add Tests to Schema
Update `models/schema.yml`:
```yaml
version: 2

models:
  - name: staging_customers
    columns:
      - name: email
        tests:
          - semantic_drift_check
          - unique
          - not_null

      - name: age
        tests:
          - semantic_drift_check

  - name: customer_orders
    description: "Semantically joined customer and order data"
    meta:
      semantic_model: true
    tests:
      - dbt_utils.equality:
          compare_model: ref('manual_customer_orders')
          compare_columns:
            - customer_id
            - order_total
```

### 3. Automated Documentation
Create `macros/generate_semantic_docs.sql`:
```sql
{% macro generate_semantic_docs() %}

  {% set anchor_query %}
    SELECT
      dataset_path,
      column_name,
      cid,
      confidence,
      fingerprint,
      created_at
    FROM {{ ref('semantic_anchors', 'column_anchors') }}
    ORDER BY dataset_path, column_name
  {% endset %}

  {% set results = run_query(anchor_query) %}

  {% if results %}
    {{ log("Generating semantic documentation...", info=true) }}

    {% for row in results %}
      {% set dataset = row[0] %}
      {% set column = row[1] %}
      {% set cid = row[2] %}
      {% set confidence = row[3] %}

      {{ log("- " ~ dataset ~ "." ~ column ~ " -> " ~ cid ~ " (confidence: " ~ confidence ~ ")", info=true) }}
    {% endfor %}
  {% endif %}

{% endmacro %}
```

## Continuous Integration

### 1. Pre-commit Hooks
Create `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: local
    hooks:
      - id: semantic-drift-check
        name: Check for semantic drift
        entry: bash -c 'npm run semantic:drift-check'
        language: system
        files: '.*\.(sql|yml)$'

      - id: anchor-validation
        name: Validate semantic anchors
        entry: bash -c 'npm run semantic:validate'
        language: system
        files: 'semantics/.*\.yml$'
```

### 2. GitHub Actions
Create `.github/workflows/semantic-checks.yml`:
```yaml
name: Semantic Quality Checks

on:
  pull_request:
    paths:
      - 'models/**'
      - 'semantics/**'

jobs:
  semantic-drift-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm install @semantic-toolkit/anchor
          pip install dbt-snowflake

      - name: Check for semantic drift
        run: |
          # Run semantic drift detection
          npx semantic-anchor drift-check \
            --dataset models/staging \
            --threshold 0.1 \
            --format github

      - name: Run dbt tests
        run: |
          dbt test --select test_type:semantic_drift_check

      - name: Generate semantic report
        run: |
          npx semantic-anchor report \
            --output semantic-report.md \
            --include-drift-history

      - name: Comment PR
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('semantic-report.md', 'utf8');

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '## Semantic Quality Report\n\n' + report
            });
```

## Production Workflows

### 1. Automated Anchor Updates
Create `models/hooks/update_anchors.sql`:
```sql
{{ config(
    pre_hook="{{ update_semantic_anchors() }}",
    post_hook="{{ validate_anchor_quality() }}"
) }}

{% macro update_semantic_anchors() %}
  {% if target.name == 'prod' %}
    {{ log("Updating semantic anchors for production...", info=true) }}

    -- Update anchors with latest data statistics
    {% set update_query %}
      INSERT INTO semantic_anchors.column_anchors
      SELECT * FROM {{ ref('staging_anchor_updates') }}
      ON CONFLICT (dataset_path, column_name)
      DO UPDATE SET
        fingerprint = EXCLUDED.fingerprint,
        confidence = EXCLUDED.confidence,
        updated_at = CURRENT_TIMESTAMP()
    {% endset %}

    {% do run_query(update_query) %}
  {% endif %}
{% endmacro %}
```

### 2. Data Quality Monitoring
Create `models/monitoring/data_quality_dashboard.sql`:
```sql
{{ config(materialized='view') }}

WITH anchor_quality AS (
  SELECT
    dataset_path,
    AVG(confidence) as avg_confidence,
    COUNT(*) as anchor_count,
    COUNT(CASE WHEN confidence < 0.8 THEN 1 END) as low_confidence_count
  FROM {{ ref('semantic_anchors', 'column_anchors') }}
  GROUP BY dataset_path
),

drift_summary AS (
  SELECT
    dataset_path,
    COUNT(*) as drift_events_24h,
    MAX(severity) as max_severity
  FROM {{ ref('semantic_anchors', 'drift_history') }}
  WHERE detected_at >= CURRENT_TIMESTAMP() - INTERVAL '24 HOURS'
  GROUP BY dataset_path
),

join_performance AS (
  SELECT
    left_dataset,
    right_dataset,
    AVG(join_confidence) as avg_join_confidence,
    COUNT(*) as successful_joins
  FROM {{ ref('semantic_join_log') }}
  WHERE created_at >= CURRENT_TIMESTAMP() - INTERVAL '24 HOURS'
  GROUP BY left_dataset, right_dataset
)

SELECT
  a.dataset_path,
  a.avg_confidence,
  a.anchor_count,
  a.low_confidence_count,
  COALESCE(d.drift_events_24h, 0) as drift_events_24h,
  COALESCE(d.max_severity, 'none') as max_drift_severity,
  CASE
    WHEN a.avg_confidence >= 0.9 AND COALESCE(d.drift_events_24h, 0) = 0 THEN '🟢 Excellent'
    WHEN a.avg_confidence >= 0.8 AND COALESCE(d.drift_events_24h, 0) <= 2 THEN '🟡 Good'
    WHEN a.avg_confidence >= 0.7 AND COALESCE(d.drift_events_24h, 0) <= 5 THEN '🟠 Fair'
    ELSE '🔴 Needs Attention'
  END as health_status
FROM anchor_quality a
LEFT JOIN drift_summary d ON a.dataset_path = d.dataset_path
ORDER BY a.avg_confidence DESC
```

## Best Practices

### 1. Version Control for Anchors
```yaml
# semantics/version.yml
anchor_schema_version: "2.1.0"
last_updated: "2024-01-15T10:30:00Z"
compatibility:
  min_dbt_version: "1.0.0"
  min_toolkit_version: "2.0.0"

breaking_changes:
  - version: "2.0.0"
    description: "Changed fingerprint format"
    migration_required: true
```

### 2. Environment-Specific Configuration
```yaml
# dbt_project.yml
vars:
  semantic_config:
    dev:
      confidence_threshold: 0.7
      enable_drift_detection: false
      anchor_update_frequency: "never"

    staging:
      confidence_threshold: 0.8
      enable_drift_detection: true
      anchor_update_frequency: "daily"

    prod:
      confidence_threshold: 0.85
      enable_drift_detection: true
      anchor_update_frequency: "hourly"
      enable_alerts: true
```

### 3. Performance Optimization
```sql
-- Use incremental models for large datasets
{{ config(
    materialized='incremental',
    unique_key='anchor_id',
    on_schema_change='sync_all_columns'
) }}

SELECT
  anchor_id,
  dataset_path,
  column_name,
  cid,
  fingerprint,
  confidence,
  updated_at
FROM {{ ref('semantic_raw_anchors') }}

{% if is_incremental() %}
  WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }})
{% endif %}
```

## Troubleshooting

### Common Issues

**Issue**: dbt can't find semantic anchors
```bash
# Check anchor table exists
dbt run --select semantic_anchors.column_anchors

# Verify connection
dbt debug --connection-timeout 30
```

**Issue**: Join confidence too low
```sql
-- Debug semantic joins
SELECT
  left_column,
  right_column,
  join_confidence,
  anchor_count
FROM {{ ref('semantic_join_debug') }}
WHERE join_confidence < 0.8
ORDER BY join_confidence DESC
```

**Issue**: Schema drift not detected
```bash
# Force drift check
npx semantic-anchor drift-check \
  --dataset models/staging \
  --force \
  --verbose
```

## Related Guides

- [Handle Schema Drift](schema-drift.md)
- [Optimize Join Performance](join-performance.md)
- [Configure Monitoring](monitoring-setup.md)
