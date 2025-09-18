# Warehouse Validation Example

**Time to complete**: 8 minutes
**Use case**: Automated SQL generation and validation for data warehouses

## What This Example Shows

- Automatic SQL join generation from semantic anchors
- Cross-database validation queries
- Data quality checks with SQL generation
- Performance-optimized warehouse queries
- dbt integration for data modeling

## Quick Start

```bash
cd examples/warehouse-validation
npm install
npm run demo
```

Expected output:
```
🏭 Warehouse Validation Demo

🔍 Analyzing warehouse schemas...
  ✅ Snowflake: 12 tables, 156 columns
  ✅ PostgreSQL: 8 tables, 94 columns
  ✅ BigQuery: 15 tables, 203 columns

🤖 Generating validation SQL...
  ✅ 23 join queries generated
  ✅ 45 quality checks created
  ✅ 12 cross-database validations

📊 Running validations...
  ✅ All joins successful (0 row count mismatches)
  ⚠️ 3 data quality issues found
  ✅ Cross-database consistency: 99.8%
```

## Core Features

### 1. Automatic Join Generation

**Problem**: You have multiple tables across different systems and need to validate that joins work correctly.

```typescript
import { WarehouseValidator, SQLGenerator } from './warehouse-validation';

const validator = new WarehouseValidator({
  connections: {
    snowflake: {
      account: 'your-account',
      database: 'ANALYTICS',
      schema: 'PROD'
    },
    postgres: {
      host: 'localhost',
      database: 'warehouse',
      schema: 'public'
    }
  }
});

// Auto-generate joins based on semantic anchors
const joinQueries = await validator.generateJoins({
  leftTable: 'snowflake.customers',
  rightTable: 'postgres.orders',
  confidence_threshold: 0.8
});

console.log('Generated SQL queries:');
joinQueries.forEach(query => {
  console.log(`-- Confidence: ${query.confidence}`);
  console.log(query.sql);
  console.log('');
});
```

**Example Generated SQL**:
```sql
-- Confidence: 0.95
-- Join customers and orders on email
SELECT
  c.customer_id,
  c.email as customer_email,
  o.order_id,
  o.customer_email as order_email,
  o.total_amount
FROM snowflake.analytics.customers c
INNER JOIN postgres.public.orders o
  ON LOWER(TRIM(c.email)) = LOWER(TRIM(o.customer_email))
WHERE c.email IS NOT NULL
  AND o.customer_email IS NOT NULL;
```

### 2. Cross-Database Validation

**Problem**: Ensure data consistency across different warehouse systems.

```typescript
import { CrossDatabaseValidator } from './cross-database-validation';

const crossValidator = new CrossDatabaseValidator();

// Compare customer counts across systems
const validationQueries = await crossValidator.generateValidationQueries({
  source: {
    connection: 'snowflake',
    table: 'customers',
    keyColumn: 'email'
  },
  target: {
    connection: 'postgres',
    table: 'customer_profiles',
    keyColumn: 'email_address'
  },
  validations: [
    'record_count',
    'unique_count',
    'null_count',
    'data_distribution'
  ]
});

// Execute validations
const results = await crossValidator.runValidations(validationQueries);

results.forEach(result => {
  if (result.passed) {
    console.log(`✅ ${result.validation}: ${result.message}`);
  } else {
    console.log(`❌ ${result.validation}: ${result.message}`);
    console.log(`   Expected: ${result.expected}, Actual: ${result.actual}`);
  }
});
```

### 3. Data Quality SQL Generation

**Problem**: Generate comprehensive data quality checks for your warehouse tables.

```typescript
import { DataQualityGenerator } from './data-quality-generator';

const qualityGenerator = new DataQualityGenerator();

// Generate quality checks for a table
const qualityChecks = await qualityGenerator.generateQualityChecks('customers', {
  checks: [
    'completeness',    // Check for null values
    'uniqueness',      // Check for duplicates
    'validity',        // Check data formats
    'consistency',     // Check referential integrity
    'accuracy'         // Check against reference data
  ]
});

// Example generated checks
console.log('Generated Quality Checks:');
qualityChecks.forEach(check => {
  console.log(`\n-- ${check.description}`);
  console.log(check.sql);
});
```

**Example Generated Quality Check SQL**:
```sql
-- Email Validity Check
SELECT
  'email_validity' as check_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN email IS NULL THEN 1 END) as null_count,
  COUNT(CASE WHEN email NOT REGEXP '^[^@]+@[^@]+\.[^@]+$' THEN 1 END) as invalid_format_count,
  ROUND(100.0 * COUNT(CASE WHEN email IS NOT NULL AND email REGEXP '^[^@]+@[^@]+\.[^@]+$' THEN 1 END) / COUNT(*), 2) as quality_score
FROM customers
WHERE created_date >= CURRENT_DATE - 30; -- Last 30 days
```

### 4. Performance-Optimized Queries

**Problem**: Generate warehouse-optimized SQL for large-scale data processing.

```typescript
import { PerformanceOptimizer } from './performance-optimizer';

const optimizer = new PerformanceOptimizer({
  warehouse_type: 'snowflake', // or 'bigquery', 'redshift', 'postgres'
  optimization_level: 'aggressive'
});

// Generate optimized join query
const optimizedQuery = await optimizer.optimizeJoin({
  leftTable: { name: 'customers', size: 10000000 }, // 10M rows
  rightTable: { name: 'orders', size: 50000000 },   // 50M rows
  joinKeys: ['customer_id'],
  selectColumns: ['customer_id', 'email', 'order_total'],
  whereClause: 'order_date >= CURRENT_DATE - 30'
});

console.log('Optimized SQL:');
console.log(optimizedQuery.sql);
console.log(`Estimated cost reduction: ${optimizedQuery.costReduction}%`);
```

**Example Optimized Query**:
```sql
-- Snowflake-optimized query with clustering and partitioning hints
SELECT /*+ USE_CACHED_RESULT */
  c.customer_id,
  c.email,
  SUM(o.order_total) as total_spend
FROM (
  SELECT customer_id, email
  FROM customers
  WHERE customer_id IS NOT NULL
) c
INNER JOIN (
  SELECT customer_id, order_total
  FROM orders
  WHERE order_date >= CURRENT_DATE - 30
    AND customer_id IS NOT NULL
    AND order_total > 0
) o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.email
ORDER BY total_spend DESC
LIMIT 10000;
```

## Advanced Features

### 5. Schema Evolution Detection

**Problem**: Detect when warehouse schemas change and update validation queries accordingly.

```typescript
import { SchemaEvolutionDetector } from './schema-evolution';

const evolutionDetector = new SchemaEvolutionDetector();

// Monitor schema changes
const changes = await evolutionDetector.detectChanges({
  connection: 'snowflake',
  schema: 'ANALYTICS.PROD',
  baseline_date: '2024-01-01'
});

if (changes.length > 0) {
  console.log('Schema changes detected:');
  changes.forEach(change => {
    console.log(`- ${change.type}: ${change.object_name} (${change.description})`);
  });

  // Auto-update validation queries
  const updatedQueries = await evolutionDetector.updateValidationQueries(changes);
  console.log(`Updated ${updatedQueries.length} validation queries`);
}
```

### 6. dbt Integration

**Problem**: Generate dbt models and tests from semantic anchors.

```typescript
import { DBTGenerator } from './dbt-generator';

const dbtGenerator = new DBTGenerator();

// Generate dbt model from semantic joins
const dbtModel = await dbtGenerator.generateModel({
  model_name: 'customer_order_summary',
  joins: [
    { left: 'customers', right: 'orders', type: 'inner' },
    { left: 'orders', right: 'order_items', type: 'left' }
  ],
  aggregations: [
    'SUM(order_total) as total_spent',
    'COUNT(DISTINCT order_id) as order_count',
    'AVG(order_total) as avg_order_value'
  ],
  group_by: ['customer_id', 'customer_email']
});

console.log('Generated dbt model:');
console.log(dbtModel.sql);

// Generate corresponding dbt tests
const dbtTests = await dbtGenerator.generateTests('customer_order_summary');
console.log('Generated dbt tests:');
dbtTests.forEach(test => console.log(`- ${test.name}: ${test.description}`));
```

**Generated dbt Model**:
```sql
{{ config(
    materialized='table',
    cluster_by=['customer_id'],
    tags=['semantic', 'customer_analytics']
) }}

WITH customer_orders AS (
  SELECT
    c.customer_id,
    c.email as customer_email,
    c.first_name,
    c.last_name,
    o.order_id,
    o.order_date,
    o.order_total
  FROM {{ ref('customers') }} c
  INNER JOIN {{ ref('orders') }} o
    ON c.customer_id = o.customer_id
),

order_items_summary AS (
  SELECT
    order_id,
    COUNT(*) as item_count,
    SUM(quantity * unit_price) as items_total
  FROM {{ ref('order_items') }}
  GROUP BY order_id
)

SELECT
  co.customer_id,
  co.customer_email,
  co.first_name,
  co.last_name,
  SUM(co.order_total) as total_spent,
  COUNT(DISTINCT co.order_id) as order_count,
  AVG(co.order_total) as avg_order_value,
  SUM(ois.item_count) as total_items_purchased
FROM customer_orders co
LEFT JOIN order_items_summary ois
  ON co.order_id = ois.order_id
GROUP BY 1, 2, 3, 4
```

### 7. Real-Time Validation Monitoring

**Problem**: Continuously monitor data quality in your warehouse.

```typescript
import { RealTimeValidator } from './real-time-validator';

const realTimeValidator = new RealTimeValidator({
  check_interval: '5 minutes',
  alert_threshold: 0.05, // 5% threshold for quality degradation
  connections: ['snowflake', 'postgres', 'bigquery']
});

// Setup continuous monitoring
await realTimeValidator.startMonitoring({
  tables: [
    'customers',
    'orders',
    'products',
    'transactions'
  ],
  checks: [
    'row_count_stability',
    'null_rate_monitoring',
    'duplicate_detection',
    'referential_integrity'
  ]
});

// Handle alerts
realTimeValidator.on('quality_alert', (alert) => {
  console.log(`🚨 Quality Alert: ${alert.table}.${alert.column}`);
  console.log(`Issue: ${alert.issue}`);
  console.log(`Severity: ${alert.severity}`);
  console.log(`Recommended Action: ${alert.action}`);
});
```

## Warehouse-Specific Optimizations

### Snowflake Optimizations
```sql
-- Use Snowflake-specific features
CREATE OR REPLACE TEMPORARY TABLE temp_validation_results AS
WITH clustered_customers AS (
  SELECT * FROM customers
  WHERE customer_id IS NOT NULL
  CLUSTER BY (customer_id)
),
partitioned_orders AS (
  SELECT * FROM orders
  WHERE order_date >= CURRENT_DATE - 90
  PARTITION BY (DATE_TRUNC('month', order_date))
)
SELECT /*+ USE_CACHED_RESULT */
  c.customer_id,
  COUNT(o.order_id) as order_count,
  SUM(o.order_total) as total_spent
FROM clustered_customers c
LEFT JOIN partitioned_orders o
  ON c.customer_id = o.customer_id
GROUP BY c.customer_id
HAVING COUNT(o.order_id) > 0;
```

### BigQuery Optimizations
```sql
-- Use BigQuery-specific features
CREATE OR REPLACE TABLE `project.dataset.validation_results`
PARTITION BY DATE(created_date)
CLUSTER BY customer_id
AS (
  WITH customer_stats AS (
    SELECT
      customer_id,
      email,
      APPROX_COUNT_DISTINCT(order_id) as approx_order_count,
      APPROX_QUANTILES(order_total, 100)[OFFSET(50)] as median_order_value
    FROM `project.dataset.customer_orders`
    WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    GROUP BY customer_id, email
  )
  SELECT
    customer_id,
    email,
    approx_order_count,
    median_order_value,
    CURRENT_TIMESTAMP() as created_date
  FROM customer_stats
  WHERE approx_order_count > 0
);
```

### PostgreSQL Optimizations
```sql
-- Use PostgreSQL-specific features
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email_btree
ON customers USING btree(email)
WHERE email IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_date
ON orders USING btree(customer_id, order_date)
WHERE customer_id IS NOT NULL;

-- Use window functions for validation
WITH validation_results AS (
  SELECT
    customer_id,
    email,
    COUNT(*) OVER (PARTITION BY email) as email_duplicate_count,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_date DESC) as recency_rank
  FROM customers
  WHERE email IS NOT NULL
)
SELECT
  customer_id,
  email,
  CASE
    WHEN email_duplicate_count > 1 THEN 'DUPLICATE_EMAIL'
    WHEN recency_rank > 1 THEN 'DUPLICATE_CUSTOMER'
    ELSE 'VALID'
  END as validation_status
FROM validation_results;
```

## Testing and Validation

### Unit Tests for Generated SQL
```typescript
import { SQLValidator, QueryTester } from './testing-utils';

describe('Generated SQL Validation', () => {
  const sqlValidator = new SQLValidator();
  const queryTester = new QueryTester();

  test('should generate valid join syntax', async () => {
    const joinQuery = await generateJoinQuery('customers', 'orders');

    const syntaxCheck = await sqlValidator.validateSyntax(joinQuery.sql);
    expect(syntaxCheck.isValid).toBe(true);

    const performanceCheck = await sqlValidator.estimatePerformance(joinQuery.sql);
    expect(performanceCheck.estimatedCost).toBeLessThan(1000);
  });

  test('should produce correct result counts', async () => {
    const testQuery = await generateTestQuery();

    const results = await queryTester.executeQuery(testQuery);
    expect(results.rowCount).toBeGreaterThan(0);
    expect(results.executionTime).toBeLessThan(5000); // 5 seconds
  });
});
```

### Performance Benchmarks
```typescript
import { PerformanceBenchmark } from './benchmarks';

const benchmark = new PerformanceBenchmark();

// Benchmark different join strategies
const strategies = ['hash_join', 'nested_loop', 'merge_join'];

for (const strategy of strategies) {
  const result = await benchmark.testJoinStrategy(strategy, {
    leftTableSize: 1000000,
    rightTableSize: 5000000,
    selectivity: 0.1
  });

  console.log(`${strategy}: ${result.executionTime}ms, ${result.memoryUsage}MB`);
}
```

## Files in This Example

```
warehouse-validation/
├── README.md                    # This file
├── package.json                # Dependencies
├── demo.ts                     # Main demo script
├── warehouse-validation.ts     # Core validation logic
├── cross-database-validation.ts # Cross-DB validation
├── data-quality-generator.ts   # Quality check generation
├── performance-optimizer.ts    # SQL optimization
├── schema-evolution.ts         # Schema change detection
├── dbt-generator.ts           # dbt model generation
├── real-time-validator.ts     # Continuous monitoring
├── config/
│   ├── warehouse-connections.yml  # Database connections
│   ├── validation-rules.yml       # Validation rule definitions
│   └── performance-settings.yml   # Optimization settings
├── sql-templates/
│   ├── snowflake/             # Snowflake-specific templates
│   ├── bigquery/              # BigQuery-specific templates
│   ├── postgres/              # PostgreSQL-specific templates
│   └── redshift/              # Redshift-specific templates
├── tests/
│   ├── sql-generation.test.ts     # SQL generation tests
│   ├── cross-validation.test.ts   # Cross-database tests
│   └── performance.test.ts        # Performance benchmarks
└── output/
    ├── generated-queries/         # Generated SQL files
    ├── validation-reports/        # Validation results
    └── performance-reports/       # Performance analysis
```

## Best Practices

### 1. Query Optimization
- Use appropriate indexes for join columns
- Partition large tables by date or key columns
- Use clustering for frequently joined columns
- Implement query result caching where possible

### 2. Validation Strategy
- Start with high-confidence joins (>0.9)
- Validate in test environment first
- Monitor query performance in production
- Set up alerts for validation failures

### 3. Error Handling
- Graceful degradation for failed queries
- Detailed logging for troubleshooting
- Rollback strategies for schema changes
- Backup validation methods

### 4. Performance Monitoring
- Track query execution times
- Monitor resource utilization
- Set performance baselines
- Optimize based on actual usage patterns

## Next Steps

- **[GitHub Integration Example](../github-integration/)** - Automated PR analysis
- **[Retail Analytics Example](../retail-analytics/)** - E-commerce data analysis
- **[Healthcare Pipeline Example](../healthcare-pipeline/)** - HIPAA-compliant processing

## Related Documentation

- [SQL Optimization Guide](./docs/sql-optimization.md)
- [Cross-Database Best Practices](./docs/cross-database-practices.md)
- [dbt Integration Guide](./docs/dbt-integration.md)
- [Performance Tuning](./docs/performance-tuning.md)