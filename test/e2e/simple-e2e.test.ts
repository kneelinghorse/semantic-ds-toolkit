import { TestDataGenerator } from '../fixtures/test-data-generator';
import { DatasetLoader } from '../fixtures/dataset-loader';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { StableColumnAnchorSystem } from '../../src/core/anchors';
import { attachSemanticsShadow, analyzeDataFrameCompatibility } from '../../src/core/attachment-api';
import { type DataFrameLike } from '../../src/core/shadow-semantics';

describe('End-to-End: Simplified Integration Tests', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = join(os.tmpdir(), 'semantic-simple-e2e');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  describe('Test Data Generation and Loading', () => {
    it('should generate and load datasets successfully', async () => {
      const dataset = TestDataGenerator.generateLargeDataset(100);
      expect(dataset).toBeDefined();
      expect(dataset.rows).toBe(100);
      expect(dataset.columns).toHaveLength(8);

      const csvContent = TestDataGenerator.writeDatasetToCSV(dataset);
      expect(csvContent).toContain('customer_id,email,phone');

      const csvPath = join(tempDir, 'test-dataset.csv');
      writeFileSync(csvPath, csvContent);

      try {
        const loadedDataset = await DatasetLoader.loadDataset(csvPath);
        expect(loadedDataset.rows).toHaveLength(100);
        expect(loadedDataset.columns).toHaveLength(8);
        expect(loadedDataset.metadata.dataTypes['email']).toBe('email');
      } finally {
        unlinkSync(csvPath);
      }
    });

    it('should handle Unicode datasets', async () => {
      const unicodeDataset = TestDataGenerator.generateUnicodeDataset();
      const csvContent = TestDataGenerator.writeDatasetToCSV(unicodeDataset);
      const csvPath = join(tempDir, 'unicode.csv');

      writeFileSync(csvPath, csvContent);

      try {
        const loadedDataset = await DatasetLoader.loadDataset(csvPath);
        expect(loadedDataset.rows.length).toBeGreaterThan(0);

        // Check that Unicode characters are preserved
        const names = loadedDataset.rows.map(row => row.name);
        const hasArabic = names.some(name => /[\u0600-\u06FF]/.test(name));
        const hasChinese = names.some(name => /[\u4e00-\u9fff]/.test(name));

        expect(hasArabic || hasChinese).toBe(true);
      } finally {
        unlinkSync(csvPath);
      }
    });

    it('should handle messy data gracefully', async () => {
      const messyDataset = TestDataGenerator.generateMessyDataset();
      const csvContent = TestDataGenerator.writeDatasetToCSV(messyDataset);
      const csvPath = join(tempDir, 'messy.csv');

      writeFileSync(csvPath, csvContent);

      try {
        const loadedDataset = await DatasetLoader.loadDataset(csvPath);
        expect(loadedDataset.rows.length).toBe(messyDataset.rows);

        const qualityResult = await DatasetLoader.validateDatasetQuality(loadedDataset);
        // Messy datasets should not be perfect; allow generous threshold
        expect(qualityResult.score).toBeLessThan(0.95);
        expect(qualityResult.issues.length).toBeGreaterThan(0);
      } finally {
        unlinkSync(csvPath);
      }
    });

    it('should handle legacy COBOL-style datasets', async () => {
      const legacyDataset = TestDataGenerator.generateLegacyDataset();
      const csvContent = TestDataGenerator.writeDatasetToCSV(legacyDataset);
      const csvPath = join(tempDir, 'legacy.csv');

      writeFileSync(csvPath, csvContent);

      try {
        const loadedDataset = await DatasetLoader.loadDataset(csvPath);
        expect(loadedDataset.columns).toContain('CUSTNO');
        expect(loadedDataset.columns).toContain('EMAILADR');
        expect(loadedDataset.metadata.dataTypes['EMAILADR']).toBe('email');
      } finally {
        unlinkSync(csvPath);
      }
    });
  });

  describe('Performance and Memory Tests', () => {
    it('should handle large datasets efficiently', async () => {
      const ROWS = 10_000;
      const largeDataset = TestDataGenerator.generateLargeDataset(ROWS);
      const csvContent = TestDataGenerator.writeDatasetToCSV(largeDataset);
      const csvPath = join(tempDir, 'large.csv');

      writeFileSync(csvPath, csvContent);

      try {
        const startTime = Date.now();
        const loadedDataset = await DatasetLoader.loadDataset(csvPath);
        const loadTime = Date.now() - startTime;

        expect(loadedDataset.rows.length).toBe(ROWS);
        expect(loadTime).toBeLessThan(5000); // Should load in <5 seconds

        const throughput = ROWS / (loadTime / 1000);
        expect(throughput).toBeGreaterThan(2000); // >2k rows/second
      } finally {
        unlinkSync(csvPath);
      }
    });

    it('should maintain reasonable memory usage', async () => {
      const initialMemory = process.memoryUsage();

      // Process multiple datasets
      for (let i = 0; i < 5; i++) {
        const dataset = TestDataGenerator.generateLargeDataset(1000);
        const csvContent = TestDataGenerator.writeDatasetToCSV(dataset);
        const csvPath = join(tempDir, `memory-test-${i}.csv`);

        writeFileSync(csvPath, csvContent);

        try {
          const loadedDataset = await DatasetLoader.loadDataset(csvPath);
          await DatasetLoader.validateDatasetQuality(loadedDataset);
        } finally {
          unlinkSync(csvPath);
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

      expect(memoryGrowth).toBeLessThan(50); // <50MB growth
    });

    it('should support concurrent processing', async () => {
      const CONCURRENT_TASKS = 3;

      const tasks = Array.from({ length: CONCURRENT_TASKS }, async (_, i) => {
        const dataset = TestDataGenerator.generateLargeDataset(500);
        const csvContent = TestDataGenerator.writeDatasetToCSV(dataset);
        const csvPath = join(tempDir, `concurrent-${i}.csv`);

        writeFileSync(csvPath, csvContent);

        try {
          const startTime = Date.now();
          const loadedDataset = await DatasetLoader.loadDataset(csvPath);
          const qualityResult = await DatasetLoader.validateDatasetQuality(loadedDataset);
          const duration = Date.now() - startTime;

          return {
            taskId: i,
            duration,
            rowCount: loadedDataset.rows.length,
            qualityScore: qualityResult.score
          };
        } finally {
          unlinkSync(csvPath);
        }
      });

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(CONCURRENT_TASKS);
      results.forEach(result => {
        expect(result.rowCount).toBe(500);
        expect(result.duration).toBeLessThan(3000); // <3 seconds per task
        expect(result.qualityScore).toBeGreaterThan(0.8);
      });
    });
  });

  describe('Data Quality and Validation', () => {
    it('should detect data quality issues correctly', async () => {
      // Create dataset with known quality issues
      const problematicDataset = {
        name: 'problematic',
        description: 'Dataset with quality issues',
        rows: 100,
        columns: [
          { name: 'id', type: 'string' as const },
          { name: 'bad col name', type: 'string' as const }, // Space in name
          { name: 'email', type: 'string' as const },
          { name: 'amount', type: 'number' as const }
        ],
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i % 10 === 0 ? null : `id_${i}`, // 10% nulls
          'bad col name': `value_${i}`,
          email: i % 5 === 0 ? 'invalid_email' : `user${i}@example.com`, // 20% invalid emails
          amount: Math.random() * 100
        }))
      };

      const csvContent = TestDataGenerator.writeDatasetToCSV(problematicDataset);
      const csvPath = join(tempDir, 'problematic.csv');

      writeFileSync(csvPath, csvContent);

      try {
        const loadedDataset = await DatasetLoader.loadDataset(csvPath);
        const qualityResult = await DatasetLoader.validateDatasetQuality(loadedDataset);

        expect(qualityResult.score).toBeLessThan(0.9); // Should detect issues
        expect(qualityResult.issues.length).toBeGreaterThan(0);
        expect(qualityResult.recommendations.length).toBeGreaterThan(0);

        // Check for specific issues
        const hasNullIssue = qualityResult.issues.some(issue =>
          issue.includes('null') || issue.includes('missing')
        );
        const hasColumnNameIssue = qualityResult.issues.some(issue =>
          issue.includes('column name')
        );

        expect(hasNullIssue || hasColumnNameIssue).toBe(true);
      } finally {
        unlinkSync(csvPath);
      }
    });

    it('should provide useful dataset summaries', async () => {
      const dataset = TestDataGenerator.generateLargeDataset(50);
      const csvContent = TestDataGenerator.writeDatasetToCSV(dataset);
      const csvPath = join(tempDir, 'summary.csv');

      writeFileSync(csvPath, csvContent);

      try {
        const loadedDataset = await DatasetLoader.loadDataset(csvPath);
        const summary = DatasetLoader.getDatasetSummary(loadedDataset);

        expect(summary).toContain('50 rows');
        expect(summary).toContain('8 columns');
        expect(summary).toContain('email');
        expect(summary).toContain('string');
      } finally {
        unlinkSync(csvPath);
      }
    });
  });

  describe('Benchmark Dataset Validation', () => {
    it('should load predefined test datasets', async () => {
      // Test that our fixture datasets can be loaded
      const fixtureFiles = [
        'test/fixtures/edge-cases/unicode-names.csv',
        'test/fixtures/edge-cases/messy-data.csv',
        'test/fixtures/edge-cases/legacy-cobol.csv'
      ];

      for (const filePath of fixtureFiles) {
        const fullPath = join(process.cwd(), filePath);
        if (existsSync(fullPath)) {
          const loadedDataset = await DatasetLoader.loadDataset(fullPath);
          expect(loadedDataset.rows.length).toBeGreaterThan(0);
          expect(loadedDataset.columns.length).toBeGreaterThan(0);
        }
      }
    });

    it('should validate fixture data quality', async () => {
      const unicodePath = join(process.cwd(), 'test/fixtures/edge-cases/unicode-names.csv');
      if (existsSync(unicodePath)) {
        const loadedDataset = await DatasetLoader.loadDataset(unicodePath);
        const qualityResult = await DatasetLoader.validateDatasetQuality(loadedDataset);

        expect(qualityResult.score).toBeGreaterThan(0.7); // Unicode data should be good quality
        expect(loadedDataset.metadata.dataTypes['email']).toBe('email');
      }

      const messyPath = join(process.cwd(), 'test/fixtures/edge-cases/messy-data.csv');
      if (existsSync(messyPath)) {
        const loadedDataset = await DatasetLoader.loadDataset(messyPath);
        const qualityResult = await DatasetLoader.validateDatasetQuality(loadedDataset);
        expect(qualityResult.score).toBeLessThan(0.95); // Messy data should have lower quality than perfect
        expect(qualityResult.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Caching and Performance', () => {
    it('should cache loaded datasets efficiently', async () => {
      const dataset = TestDataGenerator.generateLargeDataset(1000);
      const csvContent = TestDataGenerator.writeDatasetToCSV(dataset);
      const csvPath = join(tempDir, 'cache-test.csv');

      writeFileSync(csvPath, csvContent);

      try {
        // Clear cache
        DatasetLoader.clearCache();
        expect(DatasetLoader.getCacheSize()).toBe(0);

        // First load
        const startTime1 = Date.now();
        const loadedDataset1 = await DatasetLoader.loadDataset(csvPath);
        const loadTime1 = Date.now() - startTime1;

        expect(DatasetLoader.getCacheSize()).toBeGreaterThanOrEqual(1);

        // Second load (should be cached)
        const startTime2 = Date.now();
        const loadedDataset2 = await DatasetLoader.loadDataset(csvPath);
        const loadTime2 = Date.now() - startTime2;

        expect(loadTime2).toBeLessThan(loadTime1 * 0.5); // Should be significantly faster
        expect(loadedDataset1.rows.length).toBe(loadedDataset2.rows.length);
      } finally {
        unlinkSync(csvPath);
        DatasetLoader.clearCache();
      }
    });
  });

  describe('Core Integration Smoke', () => {
    function toDataFrame(dataset: Awaited<ReturnType<typeof DatasetLoader.loadDataset>>): DataFrameLike {
      const columns = dataset.columns;
      const rows = dataset.rows;
      const dtypes: Record<string, string> = {};
      for (const c of columns) {
        const t = dataset.metadata.dataTypes[c] || 'string';
        // map our loader types to pandas-like dtypes used in mapDataType
        dtypes[c] = t === 'integer' || t === 'float' ? 'float64' : t;
      }
      return {
        columns,
        dtypes,
        shape: [rows.length, columns.length],
        sample: (n: number = 1000) => {
          const limit = Math.min(n, rows.length);
          const out: Record<string, any[]> = {};
          for (const c of columns) {
            out[c] = rows.slice(0, limit).map(r => r[c]);
          }
          return out;
        },
        getColumn: (name: string) => rows.map(r => r[name])
      };
    }

    it('should attach semantics and reconcile basic columns', async () => {
      const dataset = TestDataGenerator.generateLargeDataset(50);
      const csv = TestDataGenerator.writeDatasetToCSV(dataset);
      const csvPath = join(tempDir, 'core-smoke.csv');
      writeFileSync(csvPath, csv);

      try {
        const loaded = await DatasetLoader.loadDataset(csvPath);
        const df = toDataFrame(loaded);

        const result = attachSemanticsShadow(df, { dataset_name: 'core_smoke' });
        expect(result.semantic_attachments.length).toBeGreaterThan(0);
        const strategies = result.reconciliation_result.strategy_used;
        expect(typeof strategies).toBe('string');

        // Create anchors and verify fingerprints
        const system = new StableColumnAnchorSystem();
        const columns = df.columns.map(name => ({
          name,
          values: df.sample(100)[name],
          data_type: 'string' as const
        }));
        const anchor = system.createAnchor('core_smoke', columns[0]);
        expect(anchor.anchor_id).toMatch(/^sca_/);

        // Compatibility check
        const compat = analyzeDataFrameCompatibility(df, df);
        expect(compat.compatibility_score).toBe(1);
      } finally {
        unlinkSync(csvPath);
      }
    });
  });
});
