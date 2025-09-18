# Quick Start Guide

Get up and running with the Semantic Data Science Toolkit in under 5 minutes.

## Installation

```bash
npm install @semantic-toolkit/anchor
```

## Your First Semantic Mapping

Let's analyze a CSV file and create semantic anchors:

```typescript
import { StableColumnAnchorSystem } from '@semantic-toolkit/anchor';

// Initialize the system
const anchors = new StableColumnAnchorSystem();

// Sample data from your CSV
const customerData = [
  ['john.doe@email.com', 'John', 'Doe', 25],
  ['jane.smith@email.com', 'Jane', 'Smith', 30],
  ['bob.wilson@email.com', 'Bob', 'Wilson', 35]
];

// Create semantic anchors
const emailAnchor = anchors.createAnchor(
  'customers.csv',
  customerData.map(row => row[0]), // email column
  'identity.email'
);

const ageAnchor = anchors.createAnchor(
  'customers.csv',
  customerData.map(row => row[3]), // age column
  'demographics.age'
);

console.log('Email fingerprint:', emailAnchor.fingerprint);
console.log('Age fingerprint:', ageAnchor.fingerprint);
```

## Result

```bash
Email fingerprint: dtype=string|patterns=email|unique_ratio=1.0|null_ratio=0.0
Age fingerprint: min=25|max=35|dtype=int64|unique_ratio=1.0|null_ratio=0.0
```

## Schema-Resilient Matching

When your schema changes, anchors still work:

```typescript
// New CSV with reordered columns
const newCustomerData = [
  [28, 'Alice', 'Johnson', 'alice@email.com'],  // age moved first
  [45, 'Charlie', 'Brown', 'charlie@email.com']
];

// Extract new columns
const newColumns = [
  newCustomerData.map(row => row[0]), // age (now first column)
  newCustomerData.map(row => row[3])  // email (now last column)
];

// Reconcile with existing anchors
const result = anchors.reconcileAnchors(
  'customers_v2.csv',
  newColumns,
  [emailAnchor, ageAnchor]
);

console.log('Matched anchors:', result.matchedAnchors.length); // 2
console.log('Email still matched despite reordering!');
```

## Next Steps

- CLI quickstart (sub-5 minutes):
```bash
npx -y @semantic-toolkit/anchor anchor quickstart
```

- **[Tutorial: Building Your First Data Pipeline](tutorials/data-pipeline.md)** - Complete walkthrough
- **[How-to: Handle Schema Drift](how-to/schema-drift.md)** - Common scenarios
- **[Examples](../examples/)** - Real-world implementations

## Key Concepts

- **Anchors**: Semantic fingerprints that identify columns regardless of name/position
- **Reconciliation**: Smart matching between old and new schemas
- **Fingerprints**: Content-based signatures using stats, patterns, and types

**Time to value: < 5 minutes** ✨
