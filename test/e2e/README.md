# End-to-End Testing Suite

This directory contains comprehensive end-to-end tests for the Semantic Data Science Toolkit, validating real-world scenarios and performance targets.

## Test Categories

### 1. Complete Workflow Tests (`complete-workflow.test.ts`)
Tests the entire pipeline from CSV ingestion to SQL generation:
- CSV → Inference → SCA → SQL generation
- Schema change resilience
- Semantic join operations
- Drift detection scenarios

### 2. Real Dataset Tests (`real-datasets.test.ts`)
Validates performance with benchmark datasets:
- Titanic dataset (classification)
- Online Retail dataset (transactions)
- NYC Taxi dataset (geospatial/temporal)
- Unicode and legacy format handling

### 3. Integration Points Tests (`integration-points.test.ts`)
Verifies component interactions:
- Inference Engine ↔ Anchor System
- Normalizers ↔ Fuzzy Matching
- Shadow Semantics ↔ Drift Detection
- Cross-component error handling

### 4. Performance Validation Tests (`performance-validation.test.ts`)
Ensures performance targets are met:
- 1M+ rows/second throughput
- <100ms inference latency
- >90% cache hit rate
- Memory efficiency validation

## Performance Targets

| Metric | Target | Test Coverage |
|--------|---------|---------------|
| Throughput | 1M+ rows/second | ✅ Batch processing |
| Inference Latency | <100ms for 1M rows | ✅ Large dataset inference |
| Cache Hit Rate | >90% | ✅ Repeated operations |
| Memory Usage | <500MB for 1M rows | ✅ Memory efficiency |
| Concurrent Processing | 5+ parallel tasks | ✅ Concurrency tests |

## Test Data

### Benchmark Datasets
- `titanic-sample.csv` - Classic ML dataset
- `retail-sample.csv` - E-commerce transactions
- `nyc-taxi-sample.csv` - Transportation data

### Edge Cases
- `unicode-names.csv` - International character sets
- `messy-data.csv` - Missing values and format issues
- `legacy-cobol.csv` - Fixed-width legacy formats

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with coverage
npm run test:coverage:e2e

# Run specific test file
npx jest test/e2e/complete-workflow.test.ts

# Run performance tests only
npx jest test/e2e/performance-validation.test.ts
```

## Configuration

E2E tests use a separate Jest configuration (`jest-e2e.config.js`) with:
- Extended timeout (60 seconds)
- Performance monitoring setup
- Coverage thresholds at 90%
- Custom reporters for detailed metrics

## Success Criteria

✅ **All critical paths tested and passing**
- CSV ingestion → inference → anchoring → reconciliation
- Multi-platform SQL generation
- Real-time drift detection

✅ **Performance targets validated**
- 1M+ rows/second sustained throughput
- Sub-100ms inference latency
- Efficient memory usage patterns

✅ **Real-world compatibility confirmed**
- Unicode character handling
- Legacy format support
- Dirty data resilience

✅ **Integration stability verified**
- Component boundary error handling
- Cross-system data lineage
- Semantic consistency maintenance

## Test Data Generation

The suite includes utilities for generating test datasets:
- `TestDataGenerator` - Programmable dataset creation
- `DatasetLoader` - Efficient CSV parsing and caching
- `test-datasets.config.ts` - Centralized dataset configuration

## Performance Monitoring

Each test includes performance metrics collection:
- Execution duration
- Memory usage tracking
- Throughput calculations
- Cache hit rate monitoring

Results are automatically logged and can be used for performance regression detection.