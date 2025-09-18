# CSV Semantic Inference Example

**Time to complete**: 5 minutes
**Use case**: Automatically infer semantic meaning from CSV files

## What This Example Shows

- Basic semantic inference on CSV data
- Column type detection and pattern recognition
- Creating semantic anchors for future matching
- Handling different data quality scenarios

## Quick Start

```bash
cd examples/csv-inference
npm install
npm run demo
```

Expected output:
```
🔍 Analyzing sample-customers.csv...

✅ Semantic inference complete:
  📧 Column 'email' → identity.email (confidence: 0.95)
  👤 Column 'name' → identity.full_name (confidence: 0.88)
  📱 Column 'phone' → contact.phone (confidence: 0.92)
  🎂 Column 'age' → demographics.age (confidence: 0.90)
  🏙️ Column 'city' → location.city (confidence: 0.85)

💾 Saved 5 semantic anchors to ./semantics/
```

## Step-by-Step Tutorial

### 1. Install Dependencies

```bash
npm install @semantic-toolkit/anchor csv-parser
```

### 2. Run the Demo

```typescript
// demo.ts
import { runCSVInference } from './csv-inference';

async function main() {
  console.log('🚀 Starting CSV Semantic Inference Demo...\n');

  // Run inference on sample data
  const results = await runCSVInference('./data/sample-customers.csv');

  console.log('✨ Demo completed successfully!');
  console.log(`📊 Analyzed ${results.rowCount} rows, ${results.columnCount} columns`);
  console.log(`🎯 Created ${results.anchors.length} semantic anchors`);
}

main().catch(console.error);
```

### 3. View Results

Check the generated files:
- `./semantics/anchors/` - Semantic anchor definitions
- `./output/inference-report.json` - Detailed analysis results
- `./output/confidence-scores.csv` - Column confidence ratings

## Example Data

The demo uses `data/sample-customers.csv`:
```csv
email,name,phone,age,city,registration_date
john.doe@email.com,John Doe,(555) 123-4567,25,New York,2024-01-15
jane.smith@company.org,Jane Smith,555.123.4568,30,Los Angeles,2024-01-16
bob.wilson@test.net,Bob Wilson,+1-555-123-4569,35,Chicago,2024-01-17
alice.johnson@example.com,Alice Johnson,5551234570,28,Houston,2024-01-18
charlie.brown@demo.co,Charlie Brown,(555) 123-4571,45,Phoenix,2024-01-19
```

## Advanced Examples

### Handle Messy Data
```typescript
// messy-data.ts
import { CSVInferenceEngine } from './csv-inference';

const messyData = `
"email","full name","phone number","years old","location"
"JOHN@COMPANY.COM","  John Smith  ","(555) 123-4567",25,"New York, NY"
"jane@test.org","Jane Doe",555.123.4568,,"Los Angeles"
"","Bob Wilson","+1-555-123-4569",35,""
"charlie@demo.com","Charlie","invalid phone",45,"Phoenix"
`;

const engine = new CSVInferenceEngine({
  handleMissingValues: true,
  normalizeHeaders: true,
  confidenceThreshold: 0.7
});

const results = await engine.inferFromString(messyData);
console.log('Inference results:', results);
```

### Custom Patterns
```typescript
// custom-patterns.ts
import { PatternMatcher } from '@semantic-toolkit/anchor';

const customPatterns = new PatternMatcher({
  patterns: {
    'customer_id': /^CUST-\d{6}$/,
    'product_sku': /^[A-Z]{3}-\d{4}$/,
    'order_number': /^ORD-\d{8}$/
  }
});

const engine = new CSVInferenceEngine({
  customPatternMatcher: customPatterns
});
```

## Integration Examples

### With Data Pipeline
```typescript
// pipeline-integration.ts
import { CSVProcessor, AnchorStoreManager } from '@semantic-toolkit/anchor';

class DataPipeline {
  async processNewFile(csvPath: string) {
    // 1. Infer semantics
    const inference = await this.inferSemantics(csvPath);

    // 2. Store anchors
    const store = new AnchorStoreManager('./semantics');
    for (const anchor of inference.anchors) {
      await store.saveAnchor(anchor);
    }

    // 3. Validate against existing schema
    const validation = await this.validateSchema(inference);

    // 4. Generate processing recommendations
    const recommendations = await this.generateRecommendations(validation);

    return { inference, validation, recommendations };
  }
}
```

### With dbt
```sql
-- models/staging/stg_inferred_customers.sql
{{ config(
    materialized='view',
    meta={'semantic_source': 'csv_inference'}
) }}

SELECT
  {{ semantic_cast('email', 'identity.email') }} as customer_email,
  {{ semantic_cast('name', 'identity.full_name') }} as customer_name,
  {{ semantic_cast('phone', 'contact.phone') }} as phone_number,
  {{ semantic_cast('age', 'demographics.age') }} as customer_age,
  {{ semantic_cast('city', 'location.city') }} as customer_city
FROM {{ source('raw', 'customers') }}
```

## Performance Testing

Test with different file sizes:
```bash
# Small file (1K rows)
npm run test:small

# Medium file (100K rows)
npm run test:medium

# Large file (1M rows)
npm run test:large
```

Performance targets:
- **Small files (<1K rows)**: <100ms
- **Medium files (1K-100K rows)**: <2s
- **Large files (>100K rows)**: <30s

## Common Use Cases

### 1. Data Discovery
```typescript
// Analyze unknown CSV files
const discoverer = new DataDiscoverer();
const insights = await discoverer.analyze('./data/unknown-file.csv');

console.log('Data insights:');
console.log(`- ${insights.personalDataColumns.length} PII columns detected`);
console.log(`- ${insights.businessKeys.length} potential business keys`);
console.log(`- ${insights.relationships.length} foreign key relationships`);
```

### 2. Schema Evolution
```typescript
// Compare new file with existing schema
const comparator = new SchemaComparator();
const changes = await comparator.compare(
  './data/customers-v1.csv',
  './data/customers-v2.csv'
);

if (changes.hasBreakingChanges) {
  console.warn('⚠️ Breaking schema changes detected:');
  changes.breakingChanges.forEach(change => {
    console.log(`  - ${change.type}: ${change.description}`);
  });
}
```

### 3. Quality Assessment
```typescript
// Assess data quality
const qualityChecker = new DataQualityChecker();
const quality = await qualityChecker.assess('./data/customers.csv');

console.log('Data quality report:');
console.log(`- Overall score: ${quality.overallScore}/100`);
console.log(`- Completeness: ${quality.completeness}%`);
console.log(`- Consistency: ${quality.consistency}%`);
console.log(`- Accuracy: ${quality.accuracy}%`);
```

## Files in This Example

```
csv-inference/
├── README.md              # This file
├── package.json           # Dependencies
├── demo.ts               # Main demo script
├── csv-inference.ts      # Core inference logic
├── data/
│   ├── sample-customers.csv    # Example data
│   ├── messy-data.csv         # Data quality examples
│   └── large-dataset.csv      # Performance testing
├── tests/
│   ├── inference.test.ts      # Unit tests
│   └── performance.test.ts    # Performance tests
└── output/               # Generated results
    ├── inference-report.json
    └── confidence-scores.csv
```

## Next Steps

- **[Warehouse Validation Example](../warehouse-validation/)** - SQL generation for data warehouses
- **[GitHub Integration Example](../github-integration/)** - Automated PR analysis
- **[Financial Services Example](../financial-services/)** - Domain-specific patterns