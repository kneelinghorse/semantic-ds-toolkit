import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { SemanticJoinOperator, SemanticJoinOptions } from './semantic-join';
import { CIDRegistry } from '../registry/cid-registry';
import { ShadowSemanticsLayer } from '../core/shadow-semantics';
import { StatisticalAnalyzer } from '../inference/statistical-analyzer';

describe('SemanticJoinOperator', () => {
  let joinOperator: SemanticJoinOperator;
  let cidRegistry: CIDRegistry;
  let semanticsLayer: ShadowSemanticsLayer;
  let statisticalAnalyzer: StatisticalAnalyzer;

  beforeEach(() => {
    cidRegistry = new CIDRegistry();
    semanticsLayer = new ShadowSemanticsLayer();
    statisticalAnalyzer = new StatisticalAnalyzer();
    joinOperator = new SemanticJoinOperator(cidRegistry, semanticsLayer, statisticalAnalyzer);

    // Register basic CID concepts for testing
    cidRegistry.registerPack({
      pack: 'test-pack',
      version: '1.0.0',
      description: 'Test concepts',
      concepts: [
        {
          cid: 'person.email',
          labels: ['email', 'email_address', 'user_email'],
          description: 'Email address',
          facets: { pii: true },
          examples: ['user@example.com']
        },
        {
          cid: 'person.phone',
          labels: ['phone', 'phone_number', 'mobile'],
          description: 'Phone number',
          facets: { pii: true },
          examples: ['+1-555-123-4567']
        },
        {
          cid: 'person.name',
          labels: ['name', 'full_name', 'customer_name'],
          description: 'Person name',
          facets: { pii: true },
          examples: ['John Doe']
        },
        {
          cid: 'identifier.customer_id',
          labels: ['customer_id', 'cust_id', 'user_id'],
          description: 'Customer identifier',
          facets: { identifier: true },
          examples: ['CUST-12345']
        }
      ]
    });
  });

  describe('Basic Join Functionality', () => {
    it('should perform exact match join on simple data', async () => {
      const leftData = {
        id: [1, 2, 3, 4],
        email: ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'david@example.com']
      };

      const rightData = {
        user_id: [2, 3, 4, 5],
        name: ['Bob Smith', 'Charlie Brown', 'David Wilson', 'Eve Davis']
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'inner',
        confidenceThreshold: 0.5
      });

      expect(result.data).toBeDefined();
      expect(result.statistics.outputRows).toBe(3); // Should match IDs 2, 3, 4
      expect(result.statistics.matchedRows).toBe(3);
      expect(result.matches).toHaveLength(3);
      expect(result.performance.totalTime).toBeGreaterThan(0);
    });

    it('should handle left join with unmatched rows', async () => {
      const leftData = {
        id: [1, 2, 3],
        name: ['Alice', 'Bob', 'Charlie']
      };

      const rightData = {
        user_id: [2, 4],
        score: [85, 92]
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'left',
        confidenceThreshold: 0.5
      });

      expect(result.statistics.outputRows).toBe(3); // All left rows preserved
      expect(result.statistics.matchedRows).toBe(1); // Only ID 2 matches
    });

    it('should handle outer join with all unmatched rows', async () => {
      const leftData = {
        id: [1, 2],
        name: ['Alice', 'Bob']
      };

      const rightData = {
        user_id: [3, 4],
        score: [85, 92]
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'outer',
        confidenceThreshold: 0.5
      });

      expect(result.statistics.outputRows).toBe(4); // 2 left + 2 right
      expect(result.statistics.matchedRows).toBe(0); // No matches
    });
  });

  describe('Semantic Type Matching', () => {
    it('should perform semantic join on email addresses with normalization', async () => {
      const leftData = {
        customer_email: ['ALICE@EXAMPLE.COM', 'Bob@Example.Com', 'charlie@example.com'],
        order_id: ['ORD-001', 'ORD-002', 'ORD-003']
      };

      const rightData = {
        user_email: ['alice@example.com', 'bob@example.com', 'eve@example.com'],
        user_name: ['Alice Smith', 'Bob Jones', 'Eve Davis']
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'customer_email',
        rightOn: 'user_email',
        how: 'inner',
        confidenceThreshold: 0.5,
        autoSelectNormalizers: true
      });

      expect(result.statistics.matchedRows).toBe(2); // Alice and Bob should match after normalization
      expect(result.matches.some(m => m.matchType === 'normalized')).toBe(true);
      expect(result.statistics.confidence.average).toBeGreaterThan(0.5);
    });

    it('should handle phone number normalization', async () => {
      const leftData = {
        phone: ['+1-555-123-4567', '555.234.5678', '(555) 345-6789'],
        customer_id: ['C001', 'C002', 'C003']
      };

      const rightData = {
        mobile: ['15551234567', '15552345678', '15556789012'],
        region: ['West', 'East', 'South']
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'phone',
        rightOn: 'mobile',
        how: 'inner',
        confidenceThreshold: 0.5,
        autoSelectNormalizers: true
      });

      expect(result.statistics.matchedRows).toBe(2); // First two should match after phone normalization
      expect(result.matches.some(m => m.matchType === 'normalized')).toBe(true);
    });

    it('should handle name matching with fuzzy logic', async () => {
      const leftData = {
        customer_name: ['John Doe', 'Jane Smith', 'Robert Johnson'],
        account_id: ['A001', 'A002', 'A003']
      };

      const rightData = {
        full_name: ['John D.', 'Jane Smyth', 'Bob Johnson'],
        credit_score: [750, 680, 720]
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'customer_name',
        rightOn: 'full_name',
        how: 'inner',
        confidenceThreshold: 0.6,
        enableFuzzyMatching: true,
        fuzzyThreshold: 0.7,
        autoSelectNormalizers: true
      });

      expect(result.statistics.matchedRows).toBeGreaterThan(0);
      expect(result.matches.some(m => m.matchType === 'fuzzy')).toBe(true);
    });
  });

  describe('Multi-Column Joins', () => {
    it('should perform multi-column semantic join', async () => {
      const leftData = {
        first_name: ['John', 'Jane', 'Bob'],
        last_name: ['Doe', 'Smith', 'Johnson'],
        birth_year: [1985, 1990, 1975]
      };

      const rightData = {
        fname: ['John', 'Jane', 'Robert'],
        lname: ['Doe', 'Smith', 'Johnson'],
        year_born: [1985, 1990, 1975]
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: ['first_name', 'last_name'],
        rightOn: ['fname', 'lname'],
        how: 'inner',
        confidenceThreshold: 0.7,
        autoSelectNormalizers: true
      });

      expect(result.statistics.matchedRows).toBe(2); // John Doe and Jane Smith should match
      expect(result.statistics.confidence.average).toBeGreaterThan(0.7);
    });

    it('should handle mixed data types in multi-column join', async () => {
      const leftData = {
        customer_id: ['C001', 'C002', 'C003'],
        order_date: ['2023-01-15', '2023-02-20', '2023-03-10'],
        amount: [100.50, 250.00, 75.25]
      };

      const rightData = {
        cust_id: ['C001', 'C002', 'C004'],
        purchase_date: ['2023-01-15', '2023-02-20', '2023-04-05'],
        total: [100.5, 250, 125.75]
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: ['customer_id', 'order_date'],
        rightOn: ['cust_id', 'purchase_date'],
        how: 'inner',
        confidenceThreshold: 0.8
      });

      expect(result.statistics.matchedRows).toBe(2);
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle large datasets efficiently', async () => {
      // Generate larger test datasets
      const leftSize = 10000;
      const rightSize = 8000;
      const overlapSize = 5000;

      const leftData = {
        id: Array.from({length: leftSize}, (_, i) => i + 1),
        email: Array.from({length: leftSize}, (_, i) => `user${i + 1}@example.com`)
      };

      const rightData = {
        user_id: Array.from({length: rightSize}, (_, i) => i + 1000), // Some overlap
        name: Array.from({length: rightSize}, (_, i) => `User ${i + 1000}`)
      };

      // Ensure some overlap
      for (let i = 0; i < overlapSize; i++) {
        rightData.user_id[i] = leftData.id[i];
      }

      const startTime = performance.now();
      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'inner',
        confidenceThreshold: 0.5,
        batchSize: 5000
      });
      const endTime = performance.now();

      expect(result.statistics.matchedRows).toBe(overlapSize);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.performance.totalTime).toBeGreaterThan(0);
      expect(result.performance.cacheHits).toBeGreaterThanOrEqual(0);
    });

    it('should cache normalized values effectively', async () => {
      const leftData = {
        email: ['user1@EXAMPLE.COM', 'USER2@example.com', 'User3@Example.Com', 'user1@EXAMPLE.COM'],
        id: [1, 2, 3, 1]
      };

      const rightData = {
        user_email: ['user1@example.com', 'user2@example.com', 'user4@example.com'],
        score: [85, 92, 78]
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'email',
        rightOn: 'user_email',
        how: 'inner',
        cacheNormalizedValues: true
      });

      const cacheStats = joinOperator.getCacheStats();
      expect(cacheStats.hits).toBeGreaterThan(0); // Should have cache hits for repeated values
      expect(cacheStats.hitRate).toBeGreaterThan(0);
    });
  });

  describe('Confidence Scoring', () => {
    it('should provide detailed confidence metrics', async () => {
      const leftData = {
        customer_email: ['alice@example.com', 'bob@company.com', 'charlie@test.org'],
        customer_id: ['C001', 'C002', 'C003']
      };

      const rightData = {
        user_email: ['alice@example.com', 'robert@company.com', 'charles@test.org'],
        user_score: [95, 87, 76]
      };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'customer_email',
        rightOn: 'user_email',
        how: 'inner',
        confidenceThreshold: 0.5,
        enableFuzzyMatching: true
      });

      expect(result.statistics.confidence).toBeDefined();
      expect(result.statistics.confidence.average).toBeGreaterThan(0);
      expect(result.statistics.confidence.median).toBeGreaterThan(0);
      expect(result.statistics.confidence.distribution).toBeDefined();

      // Check that we have different confidence levels
      const distribution = result.statistics.confidence.distribution;
      const totalDistribution = Object.values(distribution).reduce((a, b) => a + b, 0);
      expect(totalDistribution).toBe(result.statistics.matchedRows);
    });

    it('should handle low confidence matches appropriately', async () => {
      const leftData = {
        name: ['John Smith', 'Jane Doe', 'Bob Johnson'],
        id: [1, 2, 3]
      };

      const rightData = {
        full_name: ['Johnny Smithers', 'Janet Doe-Wilson', 'Robert Johns'],
        score: [85, 92, 78]
      };

      const highThresholdResult = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'name',
        rightOn: 'full_name',
        how: 'inner',
        confidenceThreshold: 0.9, // Very high threshold
        enableFuzzyMatching: true
      });

      const lowThresholdResult = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'name',
        rightOn: 'full_name',
        how: 'inner',
        confidenceThreshold: 0.3, // Low threshold
        enableFuzzyMatching: true
      });

      expect(lowThresholdResult.statistics.matchedRows).toBeGreaterThanOrEqual(
        highThresholdResult.statistics.matchedRows
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error for missing join columns', async () => {
      const leftData = { id: [1, 2, 3] };
      const rightData = { user_id: [1, 2, 3] };

      await expect(
        joinOperator.semanticJoin(leftData, rightData, {
          leftOn: 'missing_column',
          rightOn: 'user_id'
        })
      ).rejects.toThrow('Column \'missing_column\' not found');
    });

    it('should throw error for mismatched join column counts', async () => {
      const leftData = { id: [1, 2, 3], name: ['a', 'b', 'c'] };
      const rightData = { user_id: [1, 2, 3] };

      await expect(
        joinOperator.semanticJoin(leftData, rightData, {
          leftOn: ['id', 'name'],
          rightOn: ['user_id'] // Only one column
        })
      ).rejects.toThrow('Number of left and right join columns must match');
    });

    it('should handle empty datasets gracefully', async () => {
      const leftData = { id: [], name: [] };
      const rightData = { user_id: [1, 2, 3], score: [85, 92, 78] };

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'inner'
      });

      expect(result.statistics.outputRows).toBe(0);
      expect(result.statistics.matchedRows).toBe(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle customer data integration scenario', async () => {
      // Scenario: Joining CRM customer data with transaction data
      const crmData = {
        customer_id: ['CUST-001', 'CUST-002', 'CUST-003', 'CUST-004'],
        email: ['alice@company.com', 'bob@startup.io', 'charlie@corp.net', 'diana@firm.org'],
        full_name: ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince'],
        registration_date: ['2023-01-15', '2023-02-20', '2023-03-10', '2023-04-05']
      };

      const transactionData = {
        cust_id: ['CUST-001', 'CUST-002', 'CUST-005', 'CUST-001'],
        purchase_amount: [150.00, 299.99, 89.50, 75.25],
        purchase_date: ['2023-01-20', '2023-02-25', '2023-04-10', '2023-01-25'],
        product_category: ['Electronics', 'Books', 'Clothing', 'Electronics']
      };

      const result = await joinOperator.semanticJoin(crmData, transactionData, {
        leftOn: 'customer_id',
        rightOn: 'cust_id',
        how: 'left', // Keep all customers, even without transactions
        confidenceThreshold: 0.8
      });

      expect(result.statistics.inputRowsLeft).toBe(4);
      expect(result.statistics.inputRowsRight).toBe(4);
      expect(result.statistics.outputRows).toBe(4); // All customers preserved
      expect(result.statistics.matchedRows).toBe(3); // 3 matching transactions
    });

    it('should handle product catalog integration', async () => {
      // Scenario: Joining product catalog with inventory data
      const catalogData = {
        sku: ['SKU-001', 'SKU-002', 'SKU-003'],
        product_name: ['Wireless Headphones', 'Smart Watch', 'Bluetooth Speaker'],
        category: ['Electronics', 'Wearables', 'Audio'],
        price: [99.99, 299.99, 79.99]
      };

      const inventoryData = {
        product_code: ['SKU-001', 'SKU-002', 'SKU-004'],
        warehouse_location: ['WH-A', 'WH-B', 'WH-C'],
        stock_quantity: [150, 75, 200],
        last_restocked: ['2023-03-01', '2023-03-15', '2023-03-20']
      };

      const result = await joinOperator.semanticJoin(catalogData, inventoryData, {
        leftOn: 'sku',
        rightOn: 'product_code',
        how: 'outer', // Show all products and inventory items
        confidenceThreshold: 0.9 // High confidence for exact product matching
      });

      expect(result.statistics.matchedRows).toBe(2); // SKU-001 and SKU-002 match
      expect(result.statistics.outputRows).toBe(4); // 3 catalog + 1 unmatched inventory
    });

    it('should handle employee data deduplication scenario', async () => {
      // Scenario: Deduplicating employee records from different systems
      const hrSystemData = {
        emp_id: ['EMP001', 'EMP002', 'EMP003'],
        employee_name: ['John A. Doe', 'Jane M. Smith', 'Robert Johnson'],
        email: ['john.doe@company.com', 'j.smith@company.com', 'bob.johnson@company.com'],
        department: ['Engineering', 'Marketing', 'Sales']
      };

      const payrollSystemData = {
        employee_id: ['PAY001', 'PAY002', 'PAY003'],
        full_name: ['John Doe', 'Jane Smith', 'R. Johnson'],
        work_email: ['john.doe@company.com', 'jane.smith@company.com', 'robert.j@company.com'],
        salary: [95000, 75000, 68000]
      };

      // Try matching on both name and email for better accuracy
      const result = await joinOperator.semanticJoin(hrSystemData, payrollSystemData, {
        leftOn: ['employee_name', 'email'],
        rightOn: ['full_name', 'work_email'],
        how: 'outer',
        confidenceThreshold: 0.6,
        enableFuzzyMatching: true,
        fuzzyThreshold: 0.7
      });

      expect(result.statistics.matchedRows).toBeGreaterThan(0);

      // Should identify John Doe as definite match (same email)
      const johnDoeMatch = result.matches.find(m =>
        m.confidence > 0.8 && m.matchType === 'exact'
      );
      expect(johnDoeMatch).toBeDefined();
    });
  });

  describe('DataFrame Integration', () => {
    it('should work with array of objects format', async () => {
      const leftData = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com' }
      ];

      const rightData = [
        { user_id: 1, score: 85, region: 'West' },
        { user_id: 2, score: 92, region: 'East' },
        { user_id: 4, score: 78, region: 'South' }
      ];

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'inner'
      });

      expect(result.statistics.matchedRows).toBe(2); // IDs 1 and 2 match
    });
  });
});