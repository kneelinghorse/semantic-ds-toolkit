# How-to: Handle Schema Drift

*Task: Your schema changes and you need to maintain data pipeline compatibility*

## Quick Solutions

### Column Renamed
```typescript
// Before: customer_email
// After: email

const result = anchors.reconcileAnchors(
  'customers_v2',
  newColumns,
  existingAnchors,
  { confidence_threshold: 0.8 } // Lower threshold for renames
);

// Result: identity.email anchor matches automatically
```

### Columns Reordered
```typescript
// Before: [name, email, age]
// After: [age, email, name]

// Anchors work regardless of column position
const reconciled = anchors.reconcileAnchors('dataset', newColumnOrder, anchors);
// ✅ All anchors match correctly
```

### Data Type Changed
```typescript
// Before: age as string "25"
// After: age as number 25

const reconciled = anchors.reconcileAnchors('dataset', newColumns, anchors, {
  allow_type_changes: true,
  confidence_threshold: 0.7 // Lower threshold for type changes
});
```

### New Columns Added
```typescript
const result = anchors.reconcileAnchors('dataset', newColumns, anchors);

// Handle new columns
result.unmatchedColumns.forEach((column, index) => {
  // Create new anchor for unmatched column
  const newAnchor = anchors.createAnchor('dataset', column, `new.column_${index}`);
  await store.saveAnchor(newAnchor);
});
```

### Columns Removed
```typescript
const result = anchors.reconcileAnchors('dataset', newColumns, anchors);

// Identify removed columns
const matchedAnchorIds = new Set(result.matchedAnchors.map(m => m.anchor.id));
const removedAnchors = anchors.filter(a => !matchedAnchorIds.has(a.id));

console.log('Removed columns:', removedAnchors.map(a => a.cid));
```

## Advanced Scenarios

### Merged Columns
```typescript
// Before: first_name, last_name
// After: full_name

// Use custom reconciliation logic
const customReconciler = new CustomReconciler({
  patterns: [
    {
      description: 'Name merge pattern',
      condition: (unmatchedColumns, removedAnchors) => {
        const hasFullName = unmatchedColumns.some(col =>
          col.some(val => val.includes(' ')));
        const hadFirstLast = removedAnchors.some(a =>
          a.cid.includes('first_name') || a.cid.includes('last_name'));
        return hasFullName && hadFirstLast;
      },
      action: 'merge_name_columns'
    }
  ]
});
```

### Split Columns
```typescript
// Before: full_name
// After: first_name, last_name

const splitHandler = new ColumnSplitHandler({
  detectSplits: true,
  splitPatterns: ['name_split', 'address_split']
});

const result = splitHandler.handleSplit(
  originalAnchors,
  newColumns,
  'full_name' // Source column
);
```

## Schema Evolution Strategies

### 1. Gradual Migration
```typescript
// Support both old and new schemas during transition
const migrationPlan = new SchemaMigrationPlan({
  deprecatedColumns: ['old_email'],
  newColumns: ['email_address'],
  migrationPeriod: '30 days'
});

// Create alias mappings
migrationPlan.addAlias('old_email', 'email_address');
```

### 2. Version-Aware Anchors
```typescript
const anchorWithVersion = anchors.createAnchor(
  'customers',
  emailColumn,
  'identity.email',
  0.95,
  { schema_version: '2.0' }
);

// Reconcile with version awareness
const result = anchors.reconcileAnchors(
  'customers',
  newColumns,
  existingAnchors,
  { prefer_latest_version: true }
);
```

### 3. Backward Compatibility
```typescript
class BackwardCompatibleSystem {
  async reconcileWithFallback(dataset: string, newColumns: any[], options: any = {}) {
    // Try normal reconciliation first
    let result = anchors.reconcileAnchors(dataset, newColumns, existingAnchors, options);

    // If too many unmatched, try with relaxed thresholds
    if (result.unmatchedColumns.length > newColumns.length * 0.3) {
      result = anchors.reconcileAnchors(dataset, newColumns, existingAnchors, {
        ...options,
        confidence_threshold: Math.max(0.5, options.confidence_threshold - 0.2)
      });
    }

    return result;
  }
}
```

## Common Patterns

### Pattern: Database Migration
```typescript
// Handle database column renames from migration scripts
const migrationMapping = {
  'customer_email': 'email',
  'customer_phone': 'phone_number',
  'customer_addr': 'address'
};

const migrationReconciler = new MigrationReconciler(migrationMapping);
const result = migrationReconciler.reconcileWithMapping(dataset, newColumns, anchors);
```

### Pattern: API Schema Changes
```typescript
// Handle REST API response schema changes
const apiSchemaHandler = new APISchemaHandler({
  version: '2.0',
  mappings: {
    'user.email': 'userInfo.emailAddress',
    'user.profile.age': 'demographics.age'
  }
});

const reconciled = apiSchemaHandler.reconcileAPIResponse(responseData, existingAnchors);
```

### Pattern: ETL Pipeline Updates
```typescript
// Handle upstream ETL changes
const etlReconciler = new ETLReconciler({
  trackSchemaChanges: true,
  alertOnUnexpectedChanges: true,
  autoCreateAnchors: true
});

const result = await etlReconciler.processETLOutput(
  'warehouse.customers',
  etlOutput,
  existingAnchors
);

if (result.hasUnexpectedChanges) {
  await etlReconciler.sendSchemaChangeAlert(result.changes);
}
```

## Troubleshooting

### Low Confidence Matches
```typescript
// Debug low confidence scores
const debugResult = anchors.reconcileAnchors(dataset, newColumns, anchors, {
  debug: true,
  confidence_threshold: 0.1 // Very low to see all potential matches
});

debugResult.matchedAnchors.forEach(match => {
  if (match.confidence < 0.7) {
    console.log(`Low confidence match for ${match.anchor.cid}:`);
    console.log(`  Confidence: ${match.confidence}`);
    console.log(`  Fingerprint diff:`, match.fingerprintDiff);
  }
});
```

### False Positives
```typescript
// Add exclusion rules for problematic matches
const reconciler = new EnhancedReconciler({
  exclusionRules: [
    {
      description: 'Exclude ID columns from email matching',
      condition: (anchor, column) =>
        anchor.cid.includes('email') && column.every(val => typeof val === 'number')
    }
  ]
});
```

### Performance Issues
```typescript
// Optimize for large schemas
const optimizedReconciler = new OptimizedReconciler({
  enableParallelProcessing: true,
  maxConcurrency: 4,
  useApproximateMatching: true, // For >100 columns
  cacheFingerprints: true
});
```

## Best Practices

1. **Set Appropriate Thresholds**: Start with 0.8, lower for known schema changes
2. **Monitor Schema Changes**: Set up alerts for unexpected schema drift
3. **Version Your Schemas**: Track schema versions in anchor metadata
4. **Test Schema Changes**: Validate reconciliation before production deployment
5. **Document Migrations**: Keep track of intentional schema changes

## Related Guides

- [Handle Data Quality Issues](data-quality.md)
- [Optimize Performance](performance-tuning.md)
- [Configure Drift Detection](drift-alerts.md)