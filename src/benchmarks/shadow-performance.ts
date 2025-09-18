import { performance } from 'perf_hooks';
import {
  ShadowSemanticsLayer,
  DataFrameLike,
  SemanticContext,
  ShadowSemanticOptions
} from '../core/shadow-semantics';
import {
  SmartAnchorReconciler,
  EnhancedReconciliationResult
} from '../core/reconciler';
import { attachSemanticsShadow, reconcileAnchors } from '../core/attachment-api';
import { ColumnData, StableColumnAnchor } from '../types/anchor.types';

export interface BenchmarkResult {
  operation: string;
  execution_time_ms: number;
  memory_usage_mb: number;
  throughput: {
    columns_per_second: number;
    rows_per_second: number;
  };
  accuracy_metrics: {
    confidence_threshold: number;
    high_confidence_matches: number;
    low_confidence_matches: number;
    false_positives: number;
    false_negatives: number;
  };
  scalability_metrics: {
    dataset_size: number;
    column_count: number;
    performance_degradation: number;
  };
}

export interface BenchmarkSuite {
  suite_name: string;
  total_execution_time_ms: number;
  results: BenchmarkResult[];
  summary: {
    average_confidence: number;
    total_columns_processed: number;
    overall_throughput: number;
    memory_efficiency: number;
  };
}

export class ShadowSystemBenchmark {
  private shadowLayer: ShadowSemanticsLayer;
  private reconciler: SmartAnchorReconciler;

  constructor(options?: Partial<ShadowSemanticOptions>) {
    this.shadowLayer = new ShadowSemanticsLayer(options);
    this.reconciler = new SmartAnchorReconciler();
  }

  async runComprehensiveBenchmark(): Promise<BenchmarkSuite> {
    const suiteStartTime = performance.now();
    const results: BenchmarkResult[] = [];

    console.log('🚀 Starting Shadow Semantics Performance Benchmark Suite');

    results.push(await this.benchmarkBasicAttachment());
    results.push(await this.benchmarkLargeDataset());
    results.push(await this.benchmarkComplexReconciliation());
    results.push(await this.benchmarkMemoryEfficiency());
    results.push(await this.benchmarkConcurrentOperations());
    results.push(await this.benchmarkScalability());

    const totalTime = performance.now() - suiteStartTime;

    const summary = this.calculateSummary(results);

    return {
      suite_name: 'Shadow Semantics Comprehensive Benchmark',
      total_execution_time_ms: totalTime,
      results: results,
      summary: summary
    };
  }

  async benchmarkBasicAttachment(): Promise<BenchmarkResult> {
    console.log('  📊 Benchmarking basic semantic attachment...');

    const testDataFrame = this.generateTestDataFrame(1000, 10);
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    const result = attachSemanticsShadow(testDataFrame, {
      confidence_threshold: 0.8,
      reconciliation_strategy: 'balanced'
    });

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    const executionTime = endTime - startTime;

    return {
      operation: 'basic_attachment',
      execution_time_ms: executionTime,
      memory_usage_mb: endMemory - startMemory,
      throughput: {
        columns_per_second: testDataFrame.columns.length / (executionTime / 1000),
        rows_per_second: testDataFrame.shape[0] / (executionTime / 1000)
      },
      accuracy_metrics: this.calculateAccuracyMetrics(result.semantic_attachments, 0.8),
      scalability_metrics: {
        dataset_size: testDataFrame.shape[0],
        column_count: testDataFrame.columns.length,
        performance_degradation: 0
      }
    };
  }

  async benchmarkLargeDataset(): Promise<BenchmarkResult> {
    console.log('  📈 Benchmarking large dataset performance...');

    const testDataFrame = this.generateTestDataFrame(100000, 50);
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    const result = attachSemanticsShadow(testDataFrame, {
      confidence_threshold: 0.75,
      reconciliation_strategy: 'balanced'
    });

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    const executionTime = endTime - startTime;

    return {
      operation: 'large_dataset',
      execution_time_ms: executionTime,
      memory_usage_mb: endMemory - startMemory,
      throughput: {
        columns_per_second: testDataFrame.columns.length / (executionTime / 1000),
        rows_per_second: testDataFrame.shape[0] / (executionTime / 1000)
      },
      accuracy_metrics: this.calculateAccuracyMetrics(result.semantic_attachments, 0.75),
      scalability_metrics: {
        dataset_size: testDataFrame.shape[0],
        column_count: testDataFrame.columns.length,
        performance_degradation: 0
      }
    };
  }

  async benchmarkComplexReconciliation(): Promise<BenchmarkResult> {
    console.log('  🔄 Benchmarking complex reconciliation scenarios...');

    const newColumns = this.generateTestColumns(25);
    const existingAnchors = this.generateTestAnchors(30);
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    const result = reconcileAnchors('benchmark_dataset', newColumns, existingAnchors, {
      strategy: 'aggressive',
      confidence_threshold: 0.7,
      drift_tolerance: 0.3
    });

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    const executionTime = endTime - startTime;

    return {
      operation: 'complex_reconciliation',
      execution_time_ms: executionTime,
      memory_usage_mb: endMemory - startMemory,
      throughput: {
        columns_per_second: newColumns.length / (executionTime / 1000),
        rows_per_second: 0
      },
      accuracy_metrics: {
        confidence_threshold: 0.7,
        high_confidence_matches: result.reconciliation_result.matched_anchors.filter(m => m.confidence >= 0.9).length,
        low_confidence_matches: result.reconciliation_result.matched_anchors.filter(m => m.confidence < 0.9).length,
        false_positives: 0,
        false_negatives: 0
      },
      scalability_metrics: {
        dataset_size: 0,
        column_count: newColumns.length,
        performance_degradation: 0
      }
    };
  }

  async benchmarkMemoryEfficiency(): Promise<BenchmarkResult> {
    console.log('  💾 Benchmarking memory efficiency...');

    const iterations = 10;
    let totalTime = 0;
    let peakMemory = 0;
    let totalColumns = 0;

    for (let i = 0; i < iterations; i++) {
      const testDataFrame = this.generateTestDataFrame(5000, 20);
      const startTime = performance.now();
      const startMemory = this.getMemoryUsage();

      attachSemanticsShadow(testDataFrame, {
        confidence_threshold: 0.8,
        shadow_options: { enable_caching: false }
      });

      const endTime = performance.now();
      const endMemory = this.getMemoryUsage();

      totalTime += (endTime - startTime);
      peakMemory = Math.max(peakMemory, endMemory - startMemory);
      totalColumns += testDataFrame.columns.length;

      if (global.gc) {
        global.gc();
      }
    }

    return {
      operation: 'memory_efficiency',
      execution_time_ms: totalTime,
      memory_usage_mb: peakMemory,
      throughput: {
        columns_per_second: totalColumns / (totalTime / 1000),
        rows_per_second: 0
      },
      accuracy_metrics: {
        confidence_threshold: 0.8,
        high_confidence_matches: 0,
        low_confidence_matches: 0,
        false_positives: 0,
        false_negatives: 0
      },
      scalability_metrics: {
        dataset_size: 5000 * iterations,
        column_count: totalColumns,
        performance_degradation: 0
      }
    };
  }

  async benchmarkConcurrentOperations(): Promise<BenchmarkResult> {
    console.log('  ⚡ Benchmarking concurrent operations...');

    const testDataFrames = Array.from({ length: 5 }, () =>
      this.generateTestDataFrame(2000, 15)
    );

    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    const promises = testDataFrames.map(df =>
      attachSemanticsShadow(df, {
        confidence_threshold: 0.8,
        reconciliation_strategy: 'balanced'
      })
    );

    const results = await Promise.all(promises);

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    const executionTime = endTime - startTime;

    const totalColumns = testDataFrames.reduce((sum, df) => sum + df.columns.length, 0);
    const totalRows = testDataFrames.reduce((sum, df) => sum + df.shape[0], 0);

    return {
      operation: 'concurrent_operations',
      execution_time_ms: executionTime,
      memory_usage_mb: endMemory - startMemory,
      throughput: {
        columns_per_second: totalColumns / (executionTime / 1000),
        rows_per_second: totalRows / (executionTime / 1000)
      },
      accuracy_metrics: {
        confidence_threshold: 0.8,
        high_confidence_matches: results.reduce((sum, r) =>
          sum + r.semantic_attachments.filter(a => a.confidence_score >= 0.9).length, 0),
        low_confidence_matches: results.reduce((sum, r) =>
          sum + r.semantic_attachments.filter(a => a.confidence_score < 0.9).length, 0),
        false_positives: 0,
        false_negatives: 0
      },
      scalability_metrics: {
        dataset_size: totalRows,
        column_count: totalColumns,
        performance_degradation: 0
      }
    };
  }

  async benchmarkScalability(): Promise<BenchmarkResult> {
    console.log('  📐 Benchmarking scalability characteristics...');

    const baseSizes = [
      { rows: 1000, cols: 5 },
      { rows: 10000, cols: 15 },
      { rows: 50000, cols: 30 },
      { rows: 100000, cols: 50 }
    ];

    let baselineTime = 0;
    let currentTime = 0;
    let totalColumns = 0;
    let totalRows = 0;

    for (let i = 0; i < baseSizes.length; i++) {
      const { rows, cols } = baseSizes[i];
      const testDataFrame = this.generateTestDataFrame(rows, cols);

      const startTime = performance.now();
      attachSemanticsShadow(testDataFrame, {
        confidence_threshold: 0.8
      });
      const endTime = performance.now();

      const executionTime = endTime - startTime;
      if (i === 0) {
        baselineTime = executionTime;
      }
      currentTime = executionTime;
      totalColumns += cols;
      totalRows += rows;
    }

    const performanceDegradation = baselineTime > 0 ? (currentTime / baselineTime) : 1;

    return {
      operation: 'scalability_analysis',
      execution_time_ms: currentTime,
      memory_usage_mb: this.getMemoryUsage(),
      throughput: {
        columns_per_second: totalColumns / (currentTime / 1000),
        rows_per_second: totalRows / (currentTime / 1000)
      },
      accuracy_metrics: {
        confidence_threshold: 0.8,
        high_confidence_matches: 0,
        low_confidence_matches: 0,
        false_positives: 0,
        false_negatives: 0
      },
      scalability_metrics: {
        dataset_size: totalRows,
        column_count: totalColumns,
        performance_degradation: performanceDegradation
      }
    };
  }

  private generateTestDataFrame(rows: number, cols: number): DataFrameLike {
    const columns: string[] = [];
    const dtypes: Record<string, string> = {};
    const data: Record<string, any[]> = {};

    const columnTypes = ['id', 'name', 'email', 'amount', 'date', 'status', 'code', 'value'];

    for (let i = 0; i < cols; i++) {
      const colType = columnTypes[i % columnTypes.length];
      const colName = `${colType}_${i}`;
      columns.push(colName);

      switch (colType) {
        case 'id':
          dtypes[colName] = 'int64';
          data[colName] = Array.from({ length: rows }, (_, idx) => idx + 1);
          break;
        case 'name':
          dtypes[colName] = 'string';
          data[colName] = Array.from({ length: rows }, (_, idx) => `Name_${idx}`);
          break;
        case 'email':
          dtypes[colName] = 'string';
          data[colName] = Array.from({ length: rows }, (_, idx) => `user${idx}@example.com`);
          break;
        case 'amount':
          dtypes[colName] = 'float64';
          data[colName] = Array.from({ length: rows }, () => Math.random() * 1000);
          break;
        case 'date':
          dtypes[colName] = 'datetime';
          data[colName] = Array.from({ length: rows }, () =>
            new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
          );
          break;
        default:
          dtypes[colName] = 'string';
          data[colName] = Array.from({ length: rows }, (_, idx) => `Value_${idx}`);
      }
    }

    return {
      columns: columns,
      dtypes: dtypes,
      shape: [rows, cols],
      sample: (n = 100) => {
        const result: Record<string, any[]> = {};
        for (const col of columns) {
          result[col] = data[col].slice(0, n);
        }
        return result;
      },
      getColumn: (name: string) => data[name] || []
    };
  }

  private generateTestColumns(count: number): ColumnData[] {
    const columns: ColumnData[] = [];
    const types: ('string' | 'int64' | 'float64' | 'boolean' | 'datetime')[] =
      ['string', 'int64', 'float64', 'boolean', 'datetime'];

    for (let i = 0; i < count; i++) {
      const dataType = types[i % types.length];
      let values: any[];

      switch (dataType) {
        case 'int64':
          values = Array.from({ length: 100 }, (_, idx) => idx);
          break;
        case 'float64':
          values = Array.from({ length: 100 }, () => Math.random() * 1000);
          break;
        case 'boolean':
          values = Array.from({ length: 100 }, () => Math.random() > 0.5);
          break;
        case 'datetime':
          values = Array.from({ length: 100 }, () => new Date().toISOString());
          break;
        default:
          values = Array.from({ length: 100 }, (_, idx) => `Value_${idx}`);
      }

      columns.push({
        name: `test_column_${i}`,
        values: values,
        data_type: dataType
      });
    }

    return columns;
  }

  private generateTestAnchors(count: number): StableColumnAnchor[] {
    const anchors: StableColumnAnchor[] = [];

    for (let i = 0; i < count; i++) {
      anchors.push({
        dataset: 'test_dataset',
        column_name: `anchor_column_${i}`,
        anchor_id: `anchor_${i}`,
        fingerprint: `dtype=string;card=100;null_ratio=0.000;unique_ratio=0.900`,
        first_seen: '2024-01-01',
        last_seen: '2024-01-01',
        confidence: 0.8 + Math.random() * 0.2
      });
    }

    return anchors;
  }

  private calculateAccuracyMetrics(attachments: any[], threshold: number) {
    const highConfidence = attachments.filter(a => a.confidence_score >= 0.9).length;
    const lowConfidence = attachments.filter(a => a.confidence_score < 0.9 && a.confidence_score >= threshold).length;

    return {
      confidence_threshold: threshold,
      high_confidence_matches: highConfidence,
      low_confidence_matches: lowConfidence,
      false_positives: 0,
      false_negatives: 0
    };
  }

  private calculateSummary(results: BenchmarkResult[]) {
    const totalColumns = results.reduce((sum, r) => sum + r.scalability_metrics.column_count, 0);
    const totalTime = results.reduce((sum, r) => sum + r.execution_time_ms, 0);
    const totalMemory = results.reduce((sum, r) => sum + r.memory_usage_mb, 0);

    const confidenceResults = results.filter(r => r.accuracy_metrics.high_confidence_matches > 0);
    const avgConfidence = confidenceResults.length > 0
      ? confidenceResults.reduce((sum, r) =>
          sum + (r.accuracy_metrics.high_confidence_matches /
                (r.accuracy_metrics.high_confidence_matches + r.accuracy_metrics.low_confidence_matches || 1)
               ), 0) / confidenceResults.length
      : 0;

    return {
      average_confidence: avgConfidence,
      total_columns_processed: totalColumns,
      overall_throughput: totalColumns / (totalTime / 1000),
      memory_efficiency: totalColumns / Math.max(totalMemory, 1)
    };
  }

  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed / 1024 / 1024;
    }
    return 0;
  }

  generateReport(benchmarkSuite: BenchmarkSuite): string {
    let report = `\n📊 Shadow Semantics Performance Report\n`;
    report += `${'='.repeat(50)}\n\n`;

    report += `Suite: ${benchmarkSuite.suite_name}\n`;
    report += `Total Execution Time: ${benchmarkSuite.total_execution_time_ms.toFixed(2)}ms\n`;
    report += `Overall Throughput: ${benchmarkSuite.summary.overall_throughput.toFixed(2)} columns/sec\n`;
    report += `Memory Efficiency: ${benchmarkSuite.summary.memory_efficiency.toFixed(2)} columns/MB\n`;
    report += `Average Confidence: ${(benchmarkSuite.summary.average_confidence * 100).toFixed(1)}%\n\n`;

    report += `Individual Benchmark Results:\n`;
    report += `${'-'.repeat(30)}\n`;

    for (const result of benchmarkSuite.results) {
      report += `\n${result.operation.replace(/_/g, ' ').toUpperCase()}\n`;
      report += `  Execution Time: ${result.execution_time_ms.toFixed(2)}ms\n`;
      report += `  Memory Usage: ${result.memory_usage_mb.toFixed(2)}MB\n`;
      report += `  Throughput: ${result.throughput.columns_per_second.toFixed(2)} cols/sec\n`;

      if (result.accuracy_metrics.high_confidence_matches > 0) {
        report += `  High Confidence Matches: ${result.accuracy_metrics.high_confidence_matches}\n`;
        report += `  Low Confidence Matches: ${result.accuracy_metrics.low_confidence_matches}\n`;
      }

      if (result.scalability_metrics.performance_degradation > 1) {
        report += `  Performance Degradation: ${result.scalability_metrics.performance_degradation.toFixed(2)}x\n`;
      }
    }

    report += `\n${('='.repeat(50))}\n`;
    return report;
  }
}

export async function runShadowSystemBenchmark(options?: Partial<ShadowSemanticOptions>): Promise<BenchmarkSuite> {
  const benchmark = new ShadowSystemBenchmark(options);
  return await benchmark.runComprehensiveBenchmark();
}

export function generateBenchmarkReport(benchmarkSuite: BenchmarkSuite): string {
  const benchmark = new ShadowSystemBenchmark();
  return benchmark.generateReport(benchmarkSuite);
}