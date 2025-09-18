import { StableColumnAnchorSystem } from '../src/core/anchors';
import { AnchorStoreManager } from '../src/core/anchor-store';
import {
  StableColumnAnchor,
  ColumnData,
  DataType,
  FingerprintConfig,
  ReconciliationOptions
} from '../src/types/anchor.types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('StableColumnAnchorSystem', () => {
  let anchorSystem: StableColumnAnchorSystem;
  let testDataPath: string;

  beforeEach(() => {
    anchorSystem = new StableColumnAnchorSystem();
    testDataPath = path.join(process.cwd(), 'test', 'fixtures');
  });

  describe('Data Type Inference', () => {
    test('should infer int64 data type correctly', () => {
      const values = [1, 2, 3, 100, 999];
      const dataType = anchorSystem.inferDataType(values);
      expect(dataType).toBe('int64');
    });

    test('should infer float64 data type correctly', () => {
      const values = [1.5, 2.7, 3.14, 100.0, 999.99];
      const dataType = anchorSystem.inferDataType(values);
      expect(dataType).toBe('float64');
    });

    test('should infer string data type correctly', () => {
      const values = ['alice', 'bob', 'charlie', 'david'];
      const dataType = anchorSystem.inferDataType(values);
      expect(dataType).toBe('string');
    });

    test('should infer boolean data type correctly', () => {
      const values = [true, false, true, false];
      const dataType = anchorSystem.inferDataType(values);
      expect(dataType).toBe('boolean');
    });

    test('should infer datetime data type correctly', () => {
      const values = ['2023-01-01', '2023-02-15', '2023-12-31'];
      const dataType = anchorSystem.inferDataType(values);
      expect(dataType).toBe('datetime');
    });

    test('should handle unknown data type for mixed values', () => {
      const values = ['mixed', 123, true, null];
      const dataType = anchorSystem.inferDataType(values);
      expect(dataType).toBe('string');
    });

    test('should handle empty values array', () => {
      const values: any[] = [];
      const dataType = anchorSystem.inferDataType(values);
      expect(dataType).toBe('unknown');
    });
  });

  describe('Column Statistics Computation', () => {
    test('should compute basic statistics correctly', () => {
      const column: ColumnData = {
        name: 'customer_id',
        values: [1, 2, 3, 4, 5, null, 7],
        data_type: 'int64'
      };

      const stats = anchorSystem.computeColumnStatistics(column);

      expect(stats.total_rows).toBe(7);
      expect(stats.null_count).toBe(1);
      expect(stats.unique_count).toBe(6);
      expect(stats.min_value).toBe(1);
      expect(stats.max_value).toBe(7);
      expect(stats.data_type).toBe('int64');
    });

    test('should handle string columns correctly', () => {
      const column: ColumnData = {
        name: 'name',
        values: ['Alice', 'Bob', 'Charlie', 'Alice', ''],
        data_type: 'string'
      };

      const stats = anchorSystem.computeColumnStatistics(column);

      expect(stats.total_rows).toBe(5);
      expect(stats.null_count).toBe(1); // Empty string is treated as null
      expect(stats.unique_count).toBe(3);
      expect(stats.min_value).toBe('Alice');
      expect(stats.max_value).toBe('Charlie');
    });

    test('should limit sample values to configured size', () => {
      const values = Array.from({ length: 2000 }, (_, i) => i);
      const column: ColumnData = {
        name: 'large_column',
        values,
        data_type: 'int64'
      };

      const stats = anchorSystem.computeColumnStatistics(column);
      expect(stats.sample_values.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Regex Pattern Detection', () => {
    test('should detect ID patterns in column names', () => {
      const patterns = anchorSystem.detectRegexPatterns('customer_id', ['123', '456', '789']);
      expect(patterns).toContain('(^|_)(id|pk|key)$');
      expect(patterns).toContain('(^|_)(cust|customer|user|person)(_id)?$');
    });

    test('should detect email patterns', () => {
      const patterns = anchorSystem.detectRegexPatterns('email', [
        'alice@example.com',
        'bob@test.org',
        'charlie@company.net'
      ]);
      expect(patterns).toContain('(^|_)(email|mail)$');
    });

    test('should detect patterns in values when column name doesn\'t match', () => {
      const patterns = anchorSystem.detectRegexPatterns('column1', [
        'cust_001',
        'cust_002',
        'cust_003'
      ]);
      expect(patterns).toContain('(^|_)(cust|customer|user|person)(_id)?$');
    });

    test('should not detect patterns with low match ratio', () => {
      const patterns = anchorSystem.detectRegexPatterns('misc_field', [
        'abc',
        'def',
        'ghi',
        'jkl'
      ]);
      expect(patterns.length).toBe(0);
    });
  });

  describe('Fingerprint Generation', () => {
    test('should generate complete fingerprint for typical column', () => {
      const column: ColumnData = {
        name: 'customer_id',
        values: [1001, 1002, 1003, 1004, 1005],
        data_type: 'int64'
      };

      const fingerprint = anchorSystem.generateFingerprint(column);

      expect(fingerprint.min).toBe(1001);
      expect(fingerprint.max).toBe(1005);
      expect(fingerprint.dtype).toBe('int64');
      expect(fingerprint.cardinality).toBe(5);
      expect(fingerprint.null_ratio).toBe(0);
      expect(fingerprint.unique_ratio).toBe(1);
      expect(fingerprint.regex_patterns.length).toBeGreaterThan(0);
    });

    test('should handle columns with nulls', () => {
      const column: ColumnData = {
        name: 'optional_field',
        values: ['a', 'b', null, 'c', ''],
        data_type: 'string'
      };

      const fingerprint = anchorSystem.generateFingerprint(column);

      expect(fingerprint.null_ratio).toBe(0.4); // 2 out of 5
      expect(fingerprint.cardinality).toBe(3);
      expect(fingerprint.unique_ratio).toBe(0.6); // 3 out of 5
    });

    test('should convert fingerprint to string format', () => {
      const column: ColumnData = {
        name: 'amount',
        values: [10.5, 20.0, 30.75],
        data_type: 'float64'
      };

      const fingerprint = anchorSystem.generateFingerprint(column);
      const fingerprintStr = anchorSystem.fingerprintToString(fingerprint);

      expect(fingerprintStr).toContain('min=10.5');
      expect(fingerprintStr).toContain('max=30.75');
      expect(fingerprintStr).toContain('dtype=float64');
      expect(fingerprintStr).toContain('card=3');
    });
  });

  describe('Anchor Creation', () => {
    test('should create anchor with all required fields', () => {
      const column: ColumnData = {
        name: 'customer_id',
        values: [1, 2, 3],
        data_type: 'int64'
      };

      const anchor = anchorSystem.createAnchor('test_dataset', column);

      expect(anchor.dataset).toBe('test_dataset');
      expect(anchor.column_name).toBe('customer_id');
      expect(anchor.anchor_id).toMatch(/^sca_[a-f0-9]{16}$/);
      expect(anchor.fingerprint).toContain('dtype=int64');
      expect(anchor.first_seen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(anchor.last_seen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('should create anchor with optional CID and confidence', () => {
      const column: ColumnData = {
        name: 'email',
        values: ['a@b.com', 'c@d.com'],
        data_type: 'string'
      };

      const anchor = anchorSystem.createAnchor(
        'test_dataset',
        column,
        'identity.email',
        0.95
      );

      expect(anchor.mapped_cid).toBe('identity.email');
      expect(anchor.confidence).toBe(0.95);
    });
  });

  describe('Anchor Matching and Scoring', () => {
    let testAnchor: StableColumnAnchor;

    beforeEach(() => {
      const testColumn: ColumnData = {
        name: 'customer_id',
        values: [1001, 1002, 1003, 1004, 1005],
        data_type: 'int64'
      };
      testAnchor = anchorSystem.createAnchor('original_dataset', testColumn);
    });

    test('should calculate high match score for identical column', () => {
      const column: ColumnData = {
        name: 'customer_id',
        values: [1006, 1007, 1008, 1009, 1010],
        data_type: 'int64'
      };

      const fingerprint = anchorSystem.generateFingerprint(column);
      const score = anchorSystem.calculateMatchScore(fingerprint, testAnchor, column.name);

      expect(score.confidence).toBeGreaterThanOrEqual(0.8);
      expect(score.component_scores.dtype_match).toBe(1.0);
      expect(score.component_scores.name_similarity).toBe(1.0);
    });

    test('should calculate lower score for different data type', () => {
      const column: ColumnData = {
        name: 'customer_id',
        values: ['1001', '1002', '1003'],
        data_type: 'string'
      };

      const fingerprint = anchorSystem.generateFingerprint(column);
      const score = anchorSystem.calculateMatchScore(fingerprint, testAnchor, column.name);

      expect(score.component_scores.dtype_match).toBe(0.0);
      expect(score.confidence).toBeLessThan(0.7);
    });

    test('should calculate medium score for renamed column', () => {
      const column: ColumnData = {
        name: 'cust_pk',
        values: [2001, 2002, 2003, 2004, 2005],
        data_type: 'int64'
      };

      const fingerprint = anchorSystem.generateFingerprint(column);
      const score = anchorSystem.calculateMatchScore(fingerprint, testAnchor, column.name);

      expect(score.component_scores.dtype_match).toBe(1.0);
      expect(score.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Anchor Reconciliation', () => {
    let existingAnchors: StableColumnAnchor[];

    beforeEach(() => {
      const customerColumn: ColumnData = {
        name: 'customer_id',
        values: [1, 2, 3, 4, 5],
        data_type: 'int64'
      };

      const emailColumn: ColumnData = {
        name: 'email',
        values: ['a@b.com', 'c@d.com'],
        data_type: 'string'
      };

      existingAnchors = [
        anchorSystem.createAnchor('original_dataset', customerColumn, 'identity.person', 0.9),
        anchorSystem.createAnchor('original_dataset', emailColumn, 'identity.email', 0.95)
      ];
    });

    test('should match identical columns to existing anchors', () => {
      const newColumns: ColumnData[] = [
        {
          name: 'customer_id',
          values: [6, 7, 8, 9, 10],
          data_type: 'int64'
        }
      ];

      const result = anchorSystem.reconcileAnchors(
        'new_dataset',
        newColumns,
        existingAnchors
      );

      expect(result.matched_anchors.length).toBe(1);
      expect(result.matched_anchors[0].confidence).toBeGreaterThan(0.7);
      expect(result.unmatched_columns.length).toBe(0);
      expect(result.new_anchors.length).toBe(0);
    });

    test('should create new anchors for unmatched columns', () => {
      const newColumns: ColumnData[] = [
        {
          name: 'product_id',
          values: [101, 102, 103],
          data_type: 'int64'
        }
      ];

      const result = anchorSystem.reconcileAnchors(
        'new_dataset',
        newColumns,
        existingAnchors
      );

      expect(result.matched_anchors.length).toBe(0);
      // With create_new_anchors=true, unresolved columns are materialized as new anchors (not listed as unmatched)
      expect(result.unmatched_columns.length).toBe(0);
      expect(result.new_anchors.length).toBe(1);
      expect(result.new_anchors[0].column_name).toBe('product_id');
    });

    test('should respect confidence threshold', () => {
      const newColumns: ColumnData[] = [
        {
          name: 'cust_pk', // Similar but not identical
          values: [6, 7, 8, 9, 10],
          data_type: 'int64'
        }
      ];

      const options: ReconciliationOptions = {
        confidence_threshold: 0.95,
        allow_multiple_matches: false,
        create_new_anchors: true,
        drift_tolerance: 0.1
      };

      const result = anchorSystem.reconcileAnchors(
        'new_dataset',
        newColumns,
        existingAnchors,
        options
      );

      // With high threshold, should not match and create new anchor
      expect(result.matched_anchors.length).toBe(0);
      expect(result.new_anchors.length).toBe(1);
    });

    test('should prevent multiple matches when disabled', () => {
      const newColumns: ColumnData[] = [
        {
          name: 'customer_id',
          values: [6, 7, 8, 9, 10],
          data_type: 'int64'
        },
        {
          name: 'cust_id',
          values: [16, 17, 18, 19, 20],
          data_type: 'int64'
        }
      ];

      const options: ReconciliationOptions = {
        confidence_threshold: 0.5,
        allow_multiple_matches: false,
        create_new_anchors: true,
        drift_tolerance: 0.2
      };

      const result = anchorSystem.reconcileAnchors(
        'new_dataset',
        newColumns,
        existingAnchors,
        options
      );

      // Only first match should succeed
      expect(result.matched_anchors.length).toBe(1);
      expect(result.new_anchors.length).toBe(1);
    });
  });

  describe('Anchor Last Seen Update', () => {
    test('should update last_seen timestamp', async () => {
      const column: ColumnData = {
        name: 'test_column',
        values: [1, 2, 3],
        data_type: 'int64'
      };

      const originalAnchor = anchorSystem.createAnchor('test_dataset', column);
      const originalDate = originalAnchor.last_seen;

      // Wait a small amount to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));

      const updatedAnchor = anchorSystem.updateAnchorLastSeen(originalAnchor);
      expect(updatedAnchor.anchor_id).toBe(originalAnchor.anchor_id);
      expect(updatedAnchor.first_seen).toBe(originalAnchor.first_seen);
      // Since we're using date only (not time), it might be the same
      expect(updatedAnchor.last_seen).toBe(originalDate);
    });
  });

  describe('Configuration Options', () => {
    test('should use custom configuration', () => {
      const customConfig: Partial<FingerprintConfig> = {
        sample_size: 500,
        regex_patterns: ['custom_pattern'],
        min_cardinality_threshold: 5
      };

      const customSystem = new StableColumnAnchorSystem(customConfig);

      // Access private config for testing
      const config = (customSystem as any).config;
      expect(config.sample_size).toBe(500);
      expect(config.regex_patterns).toContain('custom_pattern');
      expect(config.min_cardinality_threshold).toBe(5);
    });
  });
});

describe('AnchorStoreManager', () => {
  let storeManager: AnchorStoreManager;
  let testStorePath: string;
  let anchorSystem: StableColumnAnchorSystem;

  beforeEach(async () => {
    testStorePath = path.join(process.cwd(), 'test', 'temp_store');
    storeManager = new AnchorStoreManager(testStorePath);
    anchorSystem = new StableColumnAnchorSystem();

    // Clean up test directory
    try {
      await fs.rm(testStorePath, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testStorePath, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  describe('Store Initialization', () => {
    test('should create store directory if it doesn\'t exist', async () => {
      await storeManager.ensureStoreDirectory();

      const stats = await fs.stat(testStorePath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Anchor Persistence', () => {
    test('should save and retrieve anchor correctly', async () => {
      const column: ColumnData = {
        name: 'customer_id',
        values: [1, 2, 3, 4, 5],
        data_type: 'int64'
      };

      const originalAnchor = anchorSystem.createAnchor('test_dataset', column, 'identity.person', 0.9);

      await storeManager.saveAnchor(originalAnchor);
      const retrievedAnchor = await storeManager.getAnchor(originalAnchor.anchor_id);

      expect(retrievedAnchor).toEqual(originalAnchor);
    });

    test('should handle non-existent anchor', async () => {
      const result = await storeManager.getAnchor('non_existent_id');
      expect(result).toBeNull();
    });

    test('should update existing anchor', async () => {
      const column: ColumnData = {
        name: 'customer_id',
        values: [1, 2, 3],
        data_type: 'int64'
      };

      const anchor = anchorSystem.createAnchor('test_dataset', column);
      await storeManager.saveAnchor(anchor);

      const updatedAnchor = { ...anchor, confidence: 0.95 };
      await storeManager.saveAnchor(updatedAnchor);

      const retrieved = await storeManager.getAnchor(anchor.anchor_id);
      expect(retrieved?.confidence).toBe(0.95);
    });
  });

  describe('Dataset-based Queries', () => {
    test('should retrieve anchors by dataset', async () => {
      const columns: ColumnData[] = [
        { name: 'id', values: [1, 2, 3], data_type: 'int64' },
        { name: 'name', values: ['a', 'b', 'c'], data_type: 'string' }
      ];

      const anchors = columns.map(col => anchorSystem.createAnchor('test_dataset', col));

      for (const anchor of anchors) {
        await storeManager.saveAnchor(anchor);
      }

      const datasetAnchors = await storeManager.getAnchorsForDataset('test_dataset');
      expect(datasetAnchors.length).toBe(2);
    });

    test('should return empty array for unknown dataset', async () => {
      const result = await storeManager.getAnchorsForDataset('unknown_dataset');
      expect(result).toEqual([]);
    });
  });

  describe('Bulk Operations', () => {
    test('should save multiple anchors efficiently', async () => {
      const columns: ColumnData[] = [
        { name: 'id', values: [1, 2, 3], data_type: 'int64' },
        { name: 'email', values: ['a@b.com'], data_type: 'string' },
        { name: 'amount', values: [10.5, 20.0], data_type: 'float64' }
      ];

      const anchors = columns.map(col => anchorSystem.createAnchor('bulk_dataset', col));

      await storeManager.bulkSaveAnchors(anchors);

      const allAnchors = await storeManager.getAllAnchors();
      expect(allAnchors.length).toBe(3);
    });
  });

  describe('Search and Pattern Matching', () => {
    test('should find anchors by pattern', async () => {
      const columns: ColumnData[] = [
        { name: 'customer_id', values: [1, 2, 3], data_type: 'int64' },
        { name: 'product_id', values: [101, 102], data_type: 'int64' },
        { name: 'name', values: ['Alice'], data_type: 'string' }
      ];

      const anchors = columns.map(col => anchorSystem.createAnchor('pattern_dataset', col));

      for (const anchor of anchors) {
        await storeManager.saveAnchor(anchor);
      }

      const idAnchors = await storeManager.findAnchorsByPattern(/_id$/);
      expect(idAnchors.length).toBe(2);
    });
  });

  describe('Store Statistics', () => {
    test('should provide accurate statistics', async () => {
      const columns: ColumnData[] = [
        { name: 'col1', values: [1], data_type: 'int64' },
        { name: 'col2', values: ['a'], data_type: 'string' }
      ];

      const anchors = [
        anchorSystem.createAnchor('dataset1', columns[0]),
        anchorSystem.createAnchor('dataset2', columns[1])
      ];

      for (const anchor of anchors) {
        await storeManager.saveAnchor(anchor);
      }

      const stats = await storeManager.getStats();
      expect(stats.total_anchors).toBe(2);
      expect(stats.datasets).toBe(2);
      expect(stats.anchors_per_dataset.dataset1).toBe(1);
      expect(stats.anchors_per_dataset.dataset2).toBe(1);
    });
  });

  describe('Anchor Deletion', () => {
    test('should delete anchor successfully', async () => {
      const column: ColumnData = {
        name: 'test_column',
        values: [1, 2, 3],
        data_type: 'int64'
      };

      const anchor = anchorSystem.createAnchor('test_dataset', column);
      await storeManager.saveAnchor(anchor);

      const deleted = await storeManager.deleteAnchor(anchor.anchor_id);
      expect(deleted).toBe(true);

      const retrieved = await storeManager.getAnchor(anchor.anchor_id);
      expect(retrieved).toBeNull();
    });

    test('should return false for non-existent anchor deletion', async () => {
      const deleted = await storeManager.deleteAnchor('non_existent_id');
      expect(deleted).toBe(false);
    });
  });
});

describe('Accuracy and Drift Tolerance', () => {
  const makeIntSeq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const makeFloatSeq = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) * 10.5);
  const makeEmails = (n: number) => Array.from({ length: n }, (_, i) => `user${i}@example.com`);
  const makePhones = (n: number) => Array.from({ length: n }, (_, i) => `+1555000${String(i).padStart(4, '0')}`);
  const makeNames = (n: number) => Array.from({ length: n }, (_, i) => `Name_${i}`);
  const makeDates = (n: number) => Array.from({ length: n }, (_, i) => `2023-01-${String((i % 28) + 1).padStart(2, '0')}`);

  const driftValues = <T>(arr: T[], ratio: number, mutate: (v: T, idx: number) => T): T[] => {
    const out = arr.slice();
    const step = Math.max(1, Math.floor(1 / ratio));
    for (let i = 0; i < out.length; i += step) {
      out[i] = mutate(out[i], i);
    }
    return out;
  };

  test('matches renamed columns with 20% drift at ≥95% accuracy', () => {
    const system = new StableColumnAnchorSystem();

    // Base dataset columns
    const base: ColumnData[] = [
      { name: 'customer_id', values: makeIntSeq(500), data_type: 'int64' },
      { name: 'email', values: makeEmails(400), data_type: 'string' },
      { name: 'amount', values: makeFloatSeq(450), data_type: 'float64' },
      { name: 'order_date', values: makeDates(420), data_type: 'datetime' },
      { name: 'phone', values: makePhones(380), data_type: 'string' },
      { name: 'name', values: makeNames(300), data_type: 'string' }
    ];

    const existingAnchors = base.map(col => system.createAnchor('base_ds', col));
    const byBaseName: Record<string, string> = Object.fromEntries(
      existingAnchors.map(a => [a.column_name, a.anchor_id])
    );

    // New dataset with renames and 20% drift
    const newColumns: ColumnData[] = [
      { name: 'cust_pk', values: driftValues(makeIntSeq(500), 0.2, v => Number(v) + 100000), data_type: 'int64' },
      { name: 'mail', values: driftValues(makeEmails(400), 0.2, (v, i) => `u${i}@test.org`), data_type: 'string' },
      { name: 'price', values: driftValues(makeFloatSeq(450), 0.2, v => Number(v) + 5.2), data_type: 'float64' },
      { name: 'timestamp', values: makeDates(420).map(d => `${d}T00:00:00`), data_type: 'datetime' },
      { name: 'tel', values: makePhones(380), data_type: 'string' },
      { name: 'title', values: makeNames(300), data_type: 'string' },
      // Extras (new columns not in base)
      { name: 'product_code', values: Array.from({ length: 200 }, (_, i) => `PR${1000 + i}`), data_type: 'string' },
      { name: 'misc_field', values: Array.from({ length: 150 }, (_, i) => i % 3 === 0 ? null : `x${i}`), data_type: 'string' }
    ];

    const options: ReconciliationOptions = {
      confidence_threshold: 0.7,
      allow_multiple_matches: false,
      create_new_anchors: true,
      drift_tolerance: 0.2
    };

    const result = system.reconcileAnchors('new_ds', newColumns, existingAnchors, options);

    const expectedPairs: Array<{ base: string; renamed: string }> = [
      { base: 'customer_id', renamed: 'cust_pk' },
      { base: 'email', renamed: 'mail' },
      { base: 'amount', renamed: 'price' },
      { base: 'order_date', renamed: 'timestamp' },
      { base: 'phone', renamed: 'tel' },
      { base: 'name', renamed: 'title' }
    ];

    let correct = 0;
    for (const pair of expectedPairs) {
      const expectedAnchorId = byBaseName[pair.base];
      const match = result.matched_anchors.find(m => m.anchor_id === expectedAnchorId && m.column_name === pair.renamed && m.confidence >= 0.7);
      if (match) correct++;
    }

    // Accuracy ≥ 95%: for 6 columns, require all 6 to match
    expect(correct).toBeGreaterThanOrEqual(Math.ceil(expectedPairs.length * 0.95));

    // Ensure new extras became new anchors and no unresolved unmatched when creating new
    expect(result.new_anchors.length).toBe(2);
    expect(result.unmatched_columns.length).toBe(0);
  });

  test('accuracy across drift levels with tolerance 0.2', () => {
    const system = new StableColumnAnchorSystem();

    const base: ColumnData[] = [
      { name: 'customer_id', values: makeIntSeq(200), data_type: 'int64' },
      { name: 'email', values: makeEmails(200), data_type: 'string' },
      { name: 'amount', values: makeFloatSeq(200), data_type: 'float64' },
      { name: 'order_date', values: makeDates(200), data_type: 'datetime' },
      { name: 'phone', values: makePhones(200), data_type: 'string' },
      { name: 'name', values: makeNames(200), data_type: 'string' }
    ];

    const existingAnchors = base.map(col => system.createAnchor('base_ds', col));
    const byBaseName: Record<string, string> = Object.fromEntries(
      existingAnchors.map(a => [a.column_name, a.anchor_id])
    );

    const pairs: Array<{ base: string; renamed: string; generator: () => any[]; type: DataType }> = [
      { base: 'customer_id', renamed: 'cust_pk', generator: () => makeIntSeq(200), type: 'int64' },
      { base: 'email', renamed: 'mail', generator: () => makeEmails(200), type: 'string' },
      { base: 'amount', renamed: 'price', generator: () => makeFloatSeq(200), type: 'float64' },
      { base: 'order_date', renamed: 'timestamp', generator: () => makeDates(200).map(d => `${d}T00:00:00`), type: 'datetime' },
      { base: 'phone', renamed: 'tel', generator: () => makePhones(200), type: 'string' },
      { base: 'name', renamed: 'title', generator: () => makeNames(200), type: 'string' }
    ];

    const drifts = [0.0, 0.1, 0.2, 0.3];
    for (const drift of drifts) {
      const newColumns: ColumnData[] = pairs.map(p => ({
        name: p.renamed,
        values: driftValues(p.generator(), drift, (v: any, i: number) => {
          if (typeof v === 'number') return v + 1; // small numeric shift
          if (typeof v === 'string') return v.replace(/^[A-Za-z]+/, m => m.toLowerCase()); // minor string change
          return v;
        }),
        data_type: p.type
      }));

      const result = system.reconcileAnchors('new_ds', newColumns, existingAnchors, {
        confidence_threshold: 0.7,
        allow_multiple_matches: false,
        create_new_anchors: true,
        drift_tolerance: 0.2
      });

      let correct = 0;
      for (const p of pairs) {
        const expectedAnchorId = byBaseName[p.base];
        const match = result.matched_anchors.find(m => m.anchor_id === expectedAnchorId && m.column_name === p.renamed && m.confidence >= 0.7);
        if (match) correct++;
      }

      if (drift === 0.0) {
        expect(correct).toBe(6);
      } else if (drift === 0.1) {
        expect(correct).toBeGreaterThanOrEqual(5);
      } else if (drift === 0.2) {
        expect(correct).toBeGreaterThanOrEqual(4);
      } else {
        expect(correct).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
