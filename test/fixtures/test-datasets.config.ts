export interface TestDatasetConfig {
  name: string;
  description: string;
  path: string;
  type: 'benchmark' | 'edge_case' | 'performance';
  expectedSemantics: Record<string, string>;
  expectedQualityScore?: number;
  expectedRows?: number;
  tags: string[];
}

export const TEST_DATASETS: TestDatasetConfig[] = [
  // Benchmark Datasets
  {
    name: 'titanic_sample',
    description: 'Titanic passenger dataset for ML benchmarking',
    path: 'test/fixtures/benchmark-datasets/titanic-sample.csv',
    type: 'benchmark',
    expectedSemantics: {
      'passenger_id': 'identity.person',
      'name': 'identity.person',
      'age': 'demographic.age',
      'fare': 'transaction.amount',
      'embarked': 'location.port'
    },
    expectedQualityScore: 0.85,
    expectedRows: 10,
    tags: ['ml', 'classification', 'historical']
  },
  {
    name: 'retail_sample',
    description: 'Online retail transaction data',
    path: 'test/fixtures/benchmark-datasets/retail-sample.csv',
    type: 'benchmark',
    expectedSemantics: {
      'invoice_no': 'identity.transaction',
      'customer_id': 'identity.customer',
      'stock_code': 'identity.product',
      'quantity': 'quantity.count',
      'unit_price': 'transaction.amount',
      'invoice_date': 'event.timestamp'
    },
    expectedQualityScore: 0.90,
    expectedRows: 10,
    tags: ['ecommerce', 'transactions', 'retail']
  },
  {
    name: 'nyc_taxi_sample',
    description: 'NYC Taxi trip records',
    path: 'test/fixtures/benchmark-datasets/nyc-taxi-sample.csv',
    type: 'benchmark',
    expectedSemantics: {
      'vendor_id': 'identity.vendor',
      'pickup_datetime': 'event.timestamp',
      'dropoff_datetime': 'event.timestamp',
      'passenger_count': 'quantity.count',
      'trip_distance': 'measurement.distance',
      'fare_amount': 'transaction.amount',
      'total_amount': 'transaction.amount',
      'pickup_longitude': 'location.longitude',
      'pickup_latitude': 'location.latitude',
      'dropoff_longitude': 'location.longitude',
      'dropoff_latitude': 'location.latitude'
    },
    expectedQualityScore: 0.88,
    expectedRows: 10,
    tags: ['transportation', 'geospatial', 'timeseries']
  },

  // Edge Case Datasets
  {
    name: 'unicode_names',
    description: 'Names in various Unicode scripts and languages',
    path: 'test/fixtures/edge-cases/unicode-names.csv',
    type: 'edge_case',
    expectedSemantics: {
      'name': 'identity.person',
      'email': 'contact.email',
      'country': 'location.country',
      'age': 'demographic.age'
    },
    expectedQualityScore: 0.75,
    expectedRows: 10,
    tags: ['unicode', 'i18n', 'names', 'encoding']
  },
  {
    name: 'messy_data',
    description: 'Dataset with missing values, invalid formats, and type mismatches',
    path: 'test/fixtures/edge-cases/messy-data.csv',
    type: 'edge_case',
    expectedSemantics: {
      'customer_id': 'identity.customer',
      'email': 'contact.email',
      'purchase_amount': 'transaction.amount',
      'timestamp': 'event.timestamp',
      'phone': 'contact.phone'
    },
    expectedQualityScore: 0.40, // Low due to data quality issues
    expectedRows: 10,
    tags: ['dirty_data', 'nulls', 'invalid_formats', 'type_mismatches']
  },
  {
    name: 'legacy_cobol',
    description: 'COBOL-style dataset with fixed-width column names',
    path: 'test/fixtures/edge-cases/legacy-cobol.csv',
    type: 'edge_case',
    expectedSemantics: {
      'CUSTNO': 'identity.customer',
      'CUSTNAME': 'identity.person',
      'EMAILADR': 'contact.email',
      'PHONENUM': 'contact.phone',
      'PURCHAMT': 'transaction.amount',
      'TXNDATE': 'event.timestamp'
    },
    expectedQualityScore: 0.95, // High quality but legacy format
    expectedRows: 10,
    tags: ['legacy', 'cobol', 'fixed_width', 'mainframe']
  }
];

export const PERFORMANCE_TEST_CONFIGS = {
  small: { rows: 1_000, description: 'Small dataset for basic testing' },
  medium: { rows: 10_000, description: 'Medium dataset for integration testing' },
  large: { rows: 100_000, description: 'Large dataset for performance testing' },
  xlarge: { rows: 1_000_000, description: 'Extra large dataset for stress testing' },
  massive: { rows: 5_000_000, description: 'Massive dataset for memory testing' }
};

export const EDGE_CASE_SCENARIOS = {
  high_nulls: { nullPercentage: 0.8, description: 'Dataset with 80% null values' },
  wide_table: { columns: 500, description: 'Dataset with 500 columns' },
  unicode_heavy: { scripts: ['arabic', 'chinese', 'hebrew', 'hindi'], description: 'Heavy Unicode usage' },
  mixed_encodings: { encodings: ['utf-8', 'latin-1', 'cp1252'], description: 'Mixed character encodings' },
  temporal_mess: { formats: ['iso', 'us', 'eu', 'epoch'], description: 'Mixed date/time formats' }
};

export function getDatasetByName(name: string): TestDatasetConfig | undefined {
  return TEST_DATASETS.find(ds => ds.name === name);
}

export function getDatasetsByType(type: TestDatasetConfig['type']): TestDatasetConfig[] {
  return TEST_DATASETS.filter(ds => ds.type === type);
}

export function getDatasetsByTag(tag: string): TestDatasetConfig[] {
  return TEST_DATASETS.filter(ds => ds.tags.includes(tag));
}

export function validateDatasetExpectations(
  datasetName: string,
  actualResults: {
    rows: number;
    semantics: Record<string, string>;
    qualityScore: number;
  }
): {
  passed: boolean;
  failures: string[];
} {
  const config = getDatasetByName(datasetName);
  if (!config) {
    return { passed: false, failures: [`Dataset '${datasetName}' not found in configuration`] };
  }

  const failures: string[] = [];

  // Check row count
  if (config.expectedRows && actualResults.rows !== config.expectedRows) {
    failures.push(`Expected ${config.expectedRows} rows, got ${actualResults.rows}`);
  }

  // Check quality score
  if (config.expectedQualityScore && actualResults.qualityScore < config.expectedQualityScore) {
    failures.push(`Expected quality score >= ${config.expectedQualityScore}, got ${actualResults.qualityScore}`);
  }

  // Check semantic mappings
  for (const [column, expectedSemantic] of Object.entries(config.expectedSemantics)) {
    const actualSemantic = actualResults.semantics[column];
    if (!actualSemantic || !actualSemantic.includes(expectedSemantic.split('.')[0])) {
      failures.push(`Column '${column}' expected semantic '${expectedSemantic}', got '${actualSemantic}'`);
    }
  }

  return { passed: failures.length === 0, failures };
}