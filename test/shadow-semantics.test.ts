import {
  attachSemanticsShadow,
  getSemanticContext,
  getAllSemanticContexts,
  analyzeDataFrameCompatibility,
  resetShadowAPI
} from '../src/core/attachment-api';
import { DataFrameLike } from '../src/core/shadow-semantics';
import { adaptDataFrame } from '../src/core/dataframe-adapters';

describe('Shadow Semantics System', () => {
  beforeEach(() => {
    resetShadowAPI();
  });

  describe('Zero Schema Modification Requirement', () => {
    test('should not modify original dataframe structure', () => {
      const originalDataFrame = createTestDataFrame();
      const originalColumns = [...originalDataFrame.columns];
      const originalDtypes = { ...originalDataFrame.dtypes };
      const originalShape = [...originalDataFrame.shape] as [number, number];

      const result = attachSemanticsShadow(originalDataFrame, {
        dataset_name: 'test_dataset'
      });

      expect(originalDataFrame.columns.sort()).toEqual(originalColumns.sort());
      expect(originalDataFrame.dtypes).toEqual(originalDtypes);
      expect(originalDataFrame.shape).toEqual(originalShape);

      expect(result.dataframe_id).toBeDefined();
      expect(result.semantic_attachments).toBeDefined();
      expect(originalDataFrame).not.toHaveProperty('semantic_context');
      expect(originalDataFrame).not.toHaveProperty('anchors');
    });

    test('should work with read-only dataframes', () => {
      const readOnlyDataFrame = Object.freeze(createTestDataFrame());

      expect(() => {
        const result = attachSemanticsShadow(readOnlyDataFrame, {
          dataset_name: 'readonly_test'
        });
        expect(result.semantic_attachments.length).toBeGreaterThan(0);
      }).not.toThrow();
    });

    test('should handle dataframes with getter-only properties', () => {
      const dataFrameWithGetters = createDataFrameWithGetters();

      const result = attachSemanticsShadow(dataFrameWithGetters, {
        dataset_name: 'getter_test'
      });

      expect(result.semantic_attachments.length).toBeGreaterThan(0);
      expect(dataFrameWithGetters.columns).toEqual(['user_id', 'email', 'created_date']);
    });

    test('should not create new properties on original object', () => {
      const originalDataFrame = createTestDataFrame();
      const originalKeys = Object.keys(originalDataFrame);

      attachSemanticsShadow(originalDataFrame, {
        dataset_name: 'no_properties_test'
      });

      const newKeys = Object.keys(originalDataFrame);
      expect(newKeys).toEqual(originalKeys);
    });

    test('should work with proxied dataframes', () => {
      const baseDataFrame = createTestDataFrame();
      const proxiedDataFrame = new Proxy(baseDataFrame, {
        set: () => {
          throw new Error('Proxy prevents modification');
        }
      });

      expect(() => {
        const result = attachSemanticsShadow(proxiedDataFrame, {
          dataset_name: 'proxy_test'
        });
        expect(result.semantic_attachments.length).toBeGreaterThan(0);
      }).not.toThrow();
    });
  });

  describe('Semantic Attachment Operations', () => {
    test('should attach semantics without modifying data structure', () => {
      const dataFrame = createTestDataFrame();
      const originalUserIds = dataFrame.getColumn('user_id').slice(0, 10);
      const originalEmails = dataFrame.getColumn('email').slice(0, 10);

      const result = attachSemanticsShadow(dataFrame, {
        dataset_name: 'attachment_test',
        confidence_threshold: 0.7
      });

      expect(result.dataframe_id).toBeDefined();
      expect(result.semantic_attachments).toHaveLength(3);

      const currentUserIds = dataFrame.getColumn('user_id').slice(0, 10);
      const currentEmails = dataFrame.getColumn('email').slice(0, 10);
      expect(currentUserIds).toEqual(originalUserIds);
      expect(currentEmails).toEqual(originalEmails);

      const semanticContext = getSemanticContext(result.dataframe_id, 'user_id');
      expect(semanticContext).toBeDefined();
      expect(semanticContext?.semantic_type).toBe('identifier');
      expect(semanticContext?.confidence).toBeGreaterThan(0.5);
    });

    test('should maintain semantic context across operations', () => {
      const dataFrame = createTestDataFrame();

      const result = attachSemanticsShadow(dataFrame, {
        dataset_name: 'persistence_test'
      });

      const allContexts = getAllSemanticContexts(result.dataframe_id);
      expect(Object.keys(allContexts)).toHaveLength(3);

      const userIdContext = getSemanticContext(result.dataframe_id, 'user_id');
      const emailContext = getSemanticContext(result.dataframe_id, 'email');

      expect(userIdContext?.semantic_type).toBe('identifier');
      expect(emailContext?.semantic_type).toBe('email_address');
    });

    test('should handle custom semantic overrides', () => {
      const dataFrame = createTestDataFrame();

      const result = attachSemanticsShadow(dataFrame, {
        dataset_name: 'custom_test',
        custom_semantics: {
          'user_id': {
            semantic_type: 'custom_identifier',
            confidence: 0.95,
            domain_specific_tags: ['customer_domain']
          }
        }
      });

      const userIdContext = getSemanticContext(result.dataframe_id, 'user_id');
      expect(userIdContext?.semantic_type).toBe('custom_identifier');
      expect(userIdContext?.confidence).toBe(0.95);
      expect(userIdContext?.domain_specific_tags).toContain('customer_domain');
    });
  });

  describe('Data Frame Adapter Integration', () => {
    test('should work with plain object dataframes', () => {
      const plainObjectDF = {
        user_id: [1, 2, 3, 4, 5],
        username: ['alice', 'bob', 'charlie', 'david', 'eve'],
        score: [95.5, 87.2, 92.1, 88.9, 94.3]
      };

      const adapted = adaptDataFrame(plainObjectDF);
      expect(adapted).toBeDefined();
      expect(adapted!.columns).toEqual(['user_id', 'username', 'score']);

      const result = attachSemanticsShadow(adapted!, {
        dataset_name: 'plain_object_test'
      });

      expect(result.semantic_attachments.length).toBeGreaterThan(0);
    });

    test('should work with array of objects', () => {
      const arrayOfObjects = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com' }
      ];

      const adapted = adaptDataFrame(arrayOfObjects);
      expect(adapted).toBeDefined();
      expect(adapted!.columns.sort()).toEqual(['email', 'id', 'name']);

      const result = attachSemanticsShadow(adapted!, {
        dataset_name: 'array_objects_test'
      });

      expect(result.semantic_attachments.length).toBe(3);

      const idContext = getSemanticContext(result.dataframe_id, 'id');
      const emailContext = getSemanticContext(result.dataframe_id, 'email');

      expect(idContext?.semantic_type).toBe('identifier');
      expect(emailContext?.semantic_type).toBe('email_address');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large datasets without schema modification', () => {
      const largeDataFrame = createLargeTestDataFrame(10000, 20);
      const originalShapeString = JSON.stringify(largeDataFrame.shape);

      const startTime = Date.now();
      const result = attachSemanticsShadow(largeDataFrame, {
        dataset_name: 'large_test',
        confidence_threshold: 0.8
      });
      const endTime = Date.now();

      expect(JSON.stringify(largeDataFrame.shape)).toBe(originalShapeString);
      expect(result.semantic_attachments.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should maintain memory efficiency', () => {
      const dataFrame = createTestDataFrame();
      const getMemoryUsage = () => {
        if (typeof process !== 'undefined' && process.memoryUsage) {
          return process.memoryUsage().heapUsed;
        }
        return 0;
      };

      const beforeMemory = getMemoryUsage();

      for (let i = 0; i < 100; i++) {
        attachSemanticsShadow(dataFrame, {
          dataset_name: `memory_test_${i}`,
          shadow_options: { enable_caching: false }
        });
      }

      const afterMemory = getMemoryUsage();
      const memoryIncrease = afterMemory - beforeMemory;

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });
  });

  describe('Compatibility Analysis', () => {
    test('should analyze dataframe compatibility without modification', () => {
      const df1 = createTestDataFrame();
      const df2 = createCompatibleDataFrame();

      const originalDf1Columns = [...df1.columns];
      const originalDf2Columns = [...df2.columns];

      const compatibility = analyzeDataFrameCompatibility(df1, df2);

      expect(df1.columns).toEqual(originalDf1Columns);
      expect(df2.columns).toEqual(originalDf2Columns);

      expect(compatibility.compatibility_score).toBeGreaterThan(0);
      expect(compatibility.common_columns).toContain('user_id');
      expect(compatibility.common_columns).toContain('email');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid dataframes gracefully', () => {
      const invalidDF = { not_a_dataframe: true };

      expect(() => {
        attachSemanticsShadow(invalidDF as any, {
          dataset_name: 'invalid_test'
        });
      }).toThrow();
    });

    test('should handle empty dataframes', () => {
      const emptyDF: DataFrameLike = {
        columns: [],
        dtypes: {},
        shape: [0, 0],
        sample: () => ({}),
        getColumn: () => []
      };

      const result = attachSemanticsShadow(emptyDF, {
        dataset_name: 'empty_test'
      });

      expect(result.semantic_attachments).toHaveLength(0);
      expect(result.dataframe_id).toBeDefined();
    });
  });
});

function createTestDataFrame(): DataFrameLike {
  return {
    columns: ['user_id', 'email', 'created_date'],
    dtypes: {
      'user_id': 'int64',
      'email': 'string',
      'created_date': 'datetime'
    },
    shape: [1000, 3],
    sample: (n = 100) => ({
      'user_id': Array.from({ length: n }, (_, i) => i + 1),
      'email': Array.from({ length: n }, (_, i) => `user${i}@example.com`),
      'created_date': Array.from({ length: n }, () => new Date().toISOString())
    }),
    getColumn: (name: string) => {
      if (name === 'user_id') return Array.from({ length: 1000 }, (_, i) => i + 1);
      if (name === 'email') return Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);
      if (name === 'created_date') return Array.from({ length: 1000 }, () => new Date().toISOString());
      return [];
    }
  };
}

function createDataFrameWithGetters(): DataFrameLike {
  const data = {
    user_id: Array.from({ length: 100 }, (_, i) => i + 1),
    email: Array.from({ length: 100 }, (_, i) => `user${i}@test.com`),
    created_date: Array.from({ length: 100 }, () => new Date().toISOString())
  };

  return {
    get columns() { return ['user_id', 'email', 'created_date']; },
    get dtypes() {
      return {
        'user_id': 'int64',
        'email': 'string',
        'created_date': 'datetime'
      };
    },
    get shape() { return [100, 3] as [number, number]; },
    sample: (n = 100) => ({
      'user_id': data.user_id.slice(0, n),
      'email': data.email.slice(0, n),
      'created_date': data.created_date.slice(0, n)
    }),
    getColumn: (name: string) => data[name as keyof typeof data] || []
  };
}

function createLargeTestDataFrame(rows: number, cols: number): DataFrameLike {
  const columns = Array.from({ length: cols }, (_, i) => `col_${i}`);
  const dtypes: Record<string, string> = {};

  columns.forEach(col => {
    dtypes[col] = Math.random() > 0.5 ? 'string' : 'int64';
  });

  return {
    columns: columns,
    dtypes: dtypes,
    shape: [rows, cols],
    sample: (n = 100) => {
      const result: Record<string, any[]> = {};
      columns.forEach(col => {
        result[col] = Array.from({ length: n }, (_, i) =>
          dtypes[col] === 'int64' ? i : `value_${i}`
        );
      });
      return result;
    },
    getColumn: (name: string) => {
      if (!columns.includes(name)) return [];
      return Array.from({ length: rows }, (_, i) =>
        dtypes[name] === 'int64' ? i : `value_${i}`
      );
    }
  };
}

function createCompatibleDataFrame(): DataFrameLike {
  return {
    columns: ['user_id', 'email', 'last_login', 'status'],
    dtypes: {
      'user_id': 'int64',
      'email': 'string',
      'last_login': 'datetime',
      'status': 'string'
    },
    shape: [500, 4],
    sample: (n = 100) => ({
      'user_id': Array.from({ length: n }, (_, i) => i + 1),
      'email': Array.from({ length: n }, (_, i) => `user${i}@example.com`),
      'last_login': Array.from({ length: n }, () => new Date().toISOString()),
      'status': Array.from({ length: n }, () => 'active')
    }),
    getColumn: (name: string) => {
      const sampleData = {
        'user_id': Array.from({ length: 500 }, (_, i) => i + 1),
        'email': Array.from({ length: 500 }, (_, i) => `user${i}@example.com`),
        'last_login': Array.from({ length: 500 }, () => new Date().toISOString()),
        'status': Array.from({ length: 500 }, () => 'active')
      };
      return sampleData[name as keyof typeof sampleData] || [];
    }
  };
}