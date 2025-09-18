# Tutorial: Your First Semantic Mapping

*Learning objective: Build a complete semantic data pipeline from CSV to validated joins*

## What You'll Build

By the end of this tutorial, you'll have:
- Semantic anchors for a customer dataset
- Schema-resilient mappings that survive column changes
- Automated join recommendations
- Data quality validation

## Prerequisites

- Node.js 18+
- Basic TypeScript knowledge
- 10 minutes

## Step 1: Setup Your Environment

Create a new project:

```bash
mkdir my-semantic-project
cd my-semantic-project
npm init -y
npm install @semantic-toolkit/anchor typescript @types/node
npx tsc --init
```

## Step 2: Prepare Sample Data

Create `data/customers_v1.csv`:
```csv
email,first_name,last_name,age,city
john@example.com,John,Doe,25,New York
jane@example.com,Jane,Smith,30,Los Angeles
bob@example.com,Bob,Wilson,35,Chicago
```

Create `data/orders_v1.csv`:
```csv
order_id,customer_email,amount,date
1001,john@example.com,99.99,2024-01-15
1002,jane@example.com,149.50,2024-01-16
1003,bob@example.com,75.00,2024-01-17
```

## Step 3: Create Your First Semantic Map

Create `src/semantic-mapping.ts`:

```typescript
import { StableColumnAnchorSystem, AnchorStoreManager } from '@semantic-toolkit/anchor';
import * as fs from 'fs';

async function createSemanticMapping() {
  // Initialize systems
  const anchors = new StableColumnAnchorSystem();
  const store = new AnchorStoreManager('./semantics');

  // Load customer data
  const customerData = parseCSV('./data/customers_v1.csv');
  const orderData = parseCSV('./data/orders_v1.csv');

  // Create semantic anchors for customers
  const customerAnchors = [
    anchors.createAnchor('customers', customerData.email, 'identity.email', 0.95),
    anchors.createAnchor('customers', customerData.first_name, 'identity.first_name', 0.85),
    anchors.createAnchor('customers', customerData.age, 'demographics.age', 0.90),
    anchors.createAnchor('customers', customerData.city, 'location.city', 0.80)
  ];

  // Create semantic anchors for orders
  const orderAnchors = [
    anchors.createAnchor('orders', orderData.order_id, 'transaction.id', 0.99),
    anchors.createAnchor('orders', orderData.customer_email, 'identity.email', 0.95),
    anchors.createAnchor('orders', orderData.amount, 'financial.amount', 0.90),
    anchors.createAnchor('orders', orderData.date, 'temporal.date', 0.95)
  ];

  // Save anchors for persistence
  for (const anchor of [...customerAnchors, ...orderAnchors]) {
    await store.saveAnchor(anchor);
  }

  console.log('✅ Created semantic mappings for', customerAnchors.length + orderAnchors.length, 'columns');
  return { customerAnchors, orderAnchors };
}

function parseCSV(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => line.split(','));

  const result: any = {};
  headers.forEach((header, index) => {
    result[header] = rows.map(row => row[index]);
  });

  return result;
}

createSemanticMapping().catch(console.error);
```

## Step 4: Test Schema Resilience

Create new data files that simulate schema changes:

`data/customers_v2.csv` (columns reordered):
```csv
age,city,email,first_name,last_name
28,Seattle,alice@example.com,Alice,Johnson
42,Boston,charlie@example.com,Charlie,Brown
```

Create `src/schema-evolution.ts`:

```typescript
import { StableColumnAnchorSystem, AnchorStoreManager } from '@semantic-toolkit/anchor';

async function testSchemaEvolution() {
  const anchors = new StableColumnAnchorSystem();
  const store = new AnchorStoreManager('./semantics');

  // Load existing anchors
  const existingAnchors = await store.getAnchorsForDataset('customers');
  console.log('📁 Loaded', existingAnchors.length, 'existing anchors');

  // Load new data with different schema
  const newData = parseCSV('./data/customers_v2.csv');
  const newColumns = [
    newData.age,      // now first column
    newData.city,     // now second column
    newData.email,    // now third column
    newData.first_name,
    newData.last_name
  ];

  // Reconcile schemas
  const result = anchors.reconcileAnchors(
    'customers_v2',
    newColumns,
    existingAnchors,
    { confidence_threshold: 0.7 }
  );

  console.log('🔄 Reconciliation Results:');
  console.log('  ✅ Matched anchors:', result.matchedAnchors.length);
  console.log('  ❓ Unmatched columns:', result.unmatchedColumns.length);
  console.log('  🆕 New anchors needed:', result.newAnchors.length);

  // Show which anchors matched
  result.matchedAnchors.forEach(match => {
    console.log(`  📍 ${match.anchor.cid} matched with confidence ${match.confidence.toFixed(2)}`);
  });

  return result;
}
```

## Step 5: Implement Smart Joins

Create `src/smart-joins.ts`:

```typescript
import { SemanticJoinPlanner } from '@semantic-toolkit/anchor';

async function planSmartJoins() {
  const planner = new SemanticJoinPlanner();
  const store = new AnchorStoreManager('./semantics');

  // Get anchors for both datasets
  const customerAnchors = await store.getAnchorsForDataset('customers');
  const orderAnchors = await store.getAnchorsForDataset('orders');

  // Find potential joins
  const joinPlan = planner.planJoin(customerAnchors, orderAnchors, {
    min_confidence: 0.8,
    join_types: ['inner', 'left']
  });

  console.log('🔗 Join Plan:');
  joinPlan.recommendations.forEach(rec => {
    console.log(`  ${rec.left_anchor.cid} ↔ ${rec.right_anchor.cid}`);
    console.log(`  Confidence: ${rec.confidence.toFixed(2)}`);
    console.log(`  Join type: ${rec.join_type}`);
    console.log('');
  });

  return joinPlan;
}
```

## Step 6: Run Your Pipeline

Create `src/main.ts`:

```typescript
import './semantic-mapping';
import './schema-evolution';
import './smart-joins';

async function runPipeline() {
  console.log('🚀 Starting Semantic Data Pipeline...\n');

  try {
    // Step 1: Create initial mappings
    await createSemanticMapping();
    console.log('');

    // Step 2: Test schema evolution
    await testSchemaEvolution();
    console.log('');

    // Step 3: Plan smart joins
    await planSmartJoins();

    console.log('✨ Pipeline completed successfully!');

  } catch (error) {
    console.error('❌ Pipeline failed:', error);
  }
}

runPipeline();
```

## Run It

```bash
npx ts-node src/main.ts
```

Expected output:
```
🚀 Starting Semantic Data Pipeline...

✅ Created semantic mappings for 7 columns

📁 Loaded 4 existing anchors
🔄 Reconciliation Results:
  ✅ Matched anchors: 4
  ❓ Unmatched columns: 0
  🆕 New anchors needed: 0
  📍 identity.email matched with confidence 0.95
  📍 demographics.age matched with confidence 0.90
  📍 location.city matched with confidence 0.80
  📍 identity.first_name matched with confidence 0.85

🔗 Join Plan:
  identity.email ↔ identity.email
  Confidence: 0.95
  Join type: inner

✨ Pipeline completed successfully!
```

## What You've Learned

1. **Semantic Fingerprinting**: How to create content-based identifiers for columns
2. **Schema Resilience**: Columns can be reordered/renamed without breaking mappings
3. **Automatic Reconciliation**: The system finds matches even with schema drift
4. **Smart Joins**: Automatic discovery of joinable columns across datasets

## Next Steps

- **[Tutorial: Handling Complex Schema Evolution](complex-schema-evolution.md)**
- **[Tutorial: Setting Up Continuous Drift Detection](drift-detection.md)**
- **[How-to: Integrate with dbt](../how-to/dbt-integration.md)**

## Troubleshooting

**Q: Anchors not matching after schema changes?**
A: Lower the `confidence_threshold` or check data quality. Use `anchor.fingerprint` to debug.

**Q: Getting duplicate anchor warnings?**
A: This is normal. The system handles duplicates automatically by taking the highest confidence match.

**Q: Want to see fingerprint details?**
A: Enable debug logging with `SEMANTIC_DEBUG=true` environment variable.
