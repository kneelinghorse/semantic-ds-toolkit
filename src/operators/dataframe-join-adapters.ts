import { SemanticJoinResult, SemanticJoinOptions } from './semantic-join';
import { DataFrameLike } from '../core/shadow-semantics';

export interface DataFrameJoinAdapter<TInput = any, TOutput = any> {
  readonly name: string;
  canHandle(obj: any): boolean;

  // Convert to our internal format for processing
  toDataFrameLike(obj: TInput): DataFrameLike;

  // Convert our join result back to the original format
  fromJoinResult(result: SemanticJoinResult, originalLeft: TInput, originalRight: TInput, options: SemanticJoinOptions): TOutput;

  // Optimize join execution for this specific type
  optimizeForType(options: SemanticJoinOptions): SemanticJoinOptions;

  // Type-specific performance hints
  getPerformanceHints(): {
    preferredBatchSize: number;
    supportsLazyExecution: boolean;
    supportsParallel: boolean;
    memoryEfficient: boolean;
  };
}

export class PandasJoinAdapter implements DataFrameJoinAdapter {
  readonly name = 'pandas';

  canHandle(obj: any): boolean {
    return obj && typeof obj === 'object' &&
           obj.constructor && obj.constructor.name === 'DataFrame' &&
           typeof obj.columns !== 'undefined' &&
           typeof obj.dtypes !== 'undefined';
  }

  toDataFrameLike(df: any): DataFrameLike {
    return {
      columns: this.getColumnNames(df),
      dtypes: this.getDataTypes(df),
      shape: this.getShape(df),
      sample: (n = 100) => this.sampleData(df, n),
      getColumn: (name: string) => this.getColumn(df, name)
    };
  }

  fromJoinResult(
    result: SemanticJoinResult,
    originalLeft: any,
    originalRight: any,
    options: SemanticJoinOptions
  ): any {
    // For pandas, we'll construct a new DataFrame from the result
    const data = result.data as any[];

    if (data.length === 0) {
      // Return empty DataFrame with appropriate columns
      const leftCols = this.getColumnNames(originalLeft).map(col => `left_${col}`);
      const rightCols = this.getColumnNames(originalRight).map(col => `right_${col}`);
      const allCols = [...leftCols, ...rightCols, '_semantic_join_meta'];

      return this.createEmptyDataFrame(allCols);
    }

    // Extract columns and data
    const columns = Object.keys(data[0]);
    const pandasData: Record<string, any[]> = {};

    for (const col of columns) {
      pandasData[col] = data.map(row => row[col]);
    }

    return this.createDataFrame(pandasData);
  }

  optimizeForType(options: SemanticJoinOptions): SemanticJoinOptions {
    return {
      ...options,
      // Pandas works well with moderate batch sizes
      batchSize: options.batchSize || 50000,
      // Enable value caching for pandas (good memory management)
      cacheNormalizedValues: options.cacheNormalizedValues !== false
    };
  }

  getPerformanceHints() {
    return {
      preferredBatchSize: 50000,
      supportsLazyExecution: false,
      supportsParallel: true,
      memoryEfficient: true
    };
  }

  private getColumnNames(df: any): string[] {
    if (Array.isArray(df.columns)) {
      return df.columns;
    }
    if (df.columns && typeof df.columns.tolist === 'function') {
      return df.columns.tolist();
    }
    if (df.columns && typeof df.columns.values !== 'undefined') {
      return Array.from(df.columns.values);
    }
    return Object.keys(df.dtypes || {});
  }

  private getDataTypes(df: any): Record<string, string> {
    const result: Record<string, string> = {};

    if (df.dtypes) {
      if (typeof df.dtypes === 'object') {
        for (const [col, dtype] of Object.entries(df.dtypes)) {
          result[col] = String(dtype);
        }
      }
    }

    return result;
  }

  private getShape(df: any): [number, number] {
    if (Array.isArray(df.shape) && df.shape.length >= 2) {
      return [df.shape[0], df.shape[1]];
    }

    const columns = this.getColumnNames(df);
    const rowCount = df.length || 0;
    return [rowCount, columns.length];
  }

  private sampleData(df: any, n = 100): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    const columns = this.getColumnNames(df);

    for (const col of columns) {
      result[col] = this.getColumn(df, col).slice(0, n);
    }

    return result;
  }

  private getColumn(df: any, columnName: string): any[] {
    if (df[columnName] && Array.isArray(df[columnName])) {
      return df[columnName];
    }

    if (df[columnName] && typeof df[columnName].tolist === 'function') {
      return df[columnName].tolist();
    }

    if (df[columnName] && df[columnName].values) {
      return Array.from(df[columnName].values);
    }

    return [];
  }

  private createEmptyDataFrame(columns: string[]): any {
    // This would typically create an actual pandas DataFrame
    // For now, return a mock structure
    const data: Record<string, any[]> = {};
    for (const col of columns) {
      data[col] = [];
    }
    return {
      columns,
      shape: [0, columns.length],
      data,
      empty: true
    };
  }

  private createDataFrame(data: Record<string, any[]>): any {
    // This would typically create an actual pandas DataFrame
    // For now, return a mock structure that mimics pandas DataFrame
    const columns = Object.keys(data);
    const rowCount = data[columns[0]]?.length || 0;

    return {
      columns,
      shape: [rowCount, columns.length],
      data,
      dtypes: this.inferDataTypes(data),
      length: rowCount
    };
  }

  private inferDataTypes(data: Record<string, any[]>): Record<string, string> {
    const dtypes: Record<string, string> = {};

    for (const [col, values] of Object.entries(data)) {
      if (values.length === 0) {
        dtypes[col] = 'object';
        continue;
      }

      const firstNonNull = values.find(v => v != null);
      if (firstNonNull == null) {
        dtypes[col] = 'object';
        continue;
      }

      if (typeof firstNonNull === 'number') {
        dtypes[col] = Number.isInteger(firstNonNull) ? 'int64' : 'float64';
      } else if (typeof firstNonNull === 'boolean') {
        dtypes[col] = 'bool';
      } else if (firstNonNull instanceof Date) {
        dtypes[col] = 'datetime64[ns]';
      } else {
        dtypes[col] = 'object';
      }
    }

    return dtypes;
  }
}

export class PolarsJoinAdapter implements DataFrameJoinAdapter {
  readonly name = 'polars';

  canHandle(obj: any): boolean {
    return obj && typeof obj === 'object' &&
           ((obj.constructor && obj.constructor.name === 'DataFrame') ||
            (obj.constructor && obj.constructor.name === 'LazyFrame')) &&
           (typeof obj.getColumns === 'function' || typeof obj.columns !== 'undefined');
  }

  toDataFrameLike(df: any): DataFrameLike {
    // Handle LazyFrame by collecting if necessary
    const workingDf = this.ensureCollected(df);

    return {
      columns: this.getColumnNames(workingDf),
      dtypes: this.getDataTypes(workingDf),
      shape: this.getShape(workingDf),
      sample: (n = 100) => this.sampleData(workingDf, n),
      getColumn: (name: string) => this.getColumn(workingDf, name)
    };
  }

  fromJoinResult(
    result: SemanticJoinResult,
    originalLeft: any,
    originalRight: any,
    options: SemanticJoinOptions
  ): any {
    const data = result.data as any[];

    if (data.length === 0) {
      const leftCols = this.getColumnNames(originalLeft).map(col => `left_${col}`);
      const rightCols = this.getColumnNames(originalRight).map(col => `right_${col}`);
      const allCols = [...leftCols, ...rightCols, '_semantic_join_meta'];

      return this.createEmptyDataFrame(allCols);
    }

    // Convert array of objects to columnar format (Polars preferred)
    const columns = Object.keys(data[0]);
    const columnarData: Record<string, any[]> = {};

    for (const col of columns) {
      columnarData[col] = data.map(row => row[col]);
    }

    return this.createPolarsDataFrame(columnarData, this.isLazyFrame(originalLeft) || this.isLazyFrame(originalRight));
  }

  optimizeForType(options: SemanticJoinOptions): SemanticJoinOptions {
    return {
      ...options,
      // Polars handles larger batches efficiently
      batchSize: options.batchSize || 100000,
      // Enable caching - Polars has excellent memory management
      cacheNormalizedValues: options.cacheNormalizedValues !== false
    };
  }

  getPerformanceHints() {
    return {
      preferredBatchSize: 100000,
      supportsLazyExecution: true,
      supportsParallel: true,
      memoryEfficient: true
    };
  }

  private ensureCollected(df: any): any {
    if (this.isLazyFrame(df)) {
      // For LazyFrame, we need to collect for immediate operations
      // In practice, this would call df.collect()
      return df.collect ? df.collect() : df;
    }
    return df;
  }

  private isLazyFrame(df: any): boolean {
    return df && df.constructor && df.constructor.name === 'LazyFrame';
  }

  private getColumnNames(df: any): string[] {
    if (typeof df.getColumns === 'function') {
      return df.getColumns();
    }
    if (df.columns && Array.isArray(df.columns)) {
      return df.columns;
    }
    if (typeof df.columnNames === 'function') {
      return df.columnNames();
    }
    return [];
  }

  private getDataTypes(df: any): Record<string, string> {
    const result: Record<string, string> = {};
    const columns = this.getColumnNames(df);

    if (typeof df.dtypes === 'function') {
      const dtypes = df.dtypes();
      if (Array.isArray(dtypes)) {
        columns.forEach((col, i) => {
          if (dtypes[i]) {
            result[col] = String(dtypes[i]);
          }
        });
      }
    } else if (typeof df.schema === 'function') {
      const schema = df.schema();
      for (const [col, dtype] of Object.entries(schema)) {
        result[col] = String(dtype);
      }
    }

    return result;
  }

  private getShape(df: any): [number, number] {
    const height = typeof df.height === 'number' ? df.height :
                   (typeof df.len === 'function' ? df.len() : 0);
    const width = typeof df.width === 'number' ? df.width :
                  this.getColumnNames(df).length;
    return [height, width];
  }

  private sampleData(df: any, n = 100): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    const columns = this.getColumnNames(df);

    let sampledDf = df;

    // Use Polars-specific sampling methods
    if (typeof df.sample === 'function') {
      sampledDf = df.sample(n);
    } else if (typeof df.head === 'function') {
      sampledDf = df.head(n);
    } else if (typeof df.limit === 'function') {
      sampledDf = df.limit(n);
    }

    for (const col of columns) {
      result[col] = this.getColumn(sampledDf, col);
    }

    return result;
  }

  private getColumn(df: any, columnName: string): any[] {
    // Try Polars-specific methods first
    if (typeof df.getColumn === 'function') {
      const column = df.getColumn(columnName);
      if (column && typeof column.toArray === 'function') {
        return column.toArray();
      }
      if (column && typeof column.toList === 'function') {
        return column.toList();
      }
      if (Array.isArray(column)) {
        return column;
      }
    }

    // Fallback to selecting and converting
    if (typeof df.select === 'function') {
      try {
        const selected = df.select(columnName);
        if (selected && typeof selected.toArray === 'function') {
          return selected.toArray();
        }
      } catch (e) {
        // Fallback if selection fails
      }
    }

    return [];
  }

  private createEmptyDataFrame(columns: string[]): any {
    // Create empty Polars-like structure
    const data: Record<string, any[]> = {};
    for (const col of columns) {
      data[col] = [];
    }

    return {
      columns,
      shape: [0, columns.length],
      height: 0,
      width: columns.length,
      data,
      empty: true,
      // Mock Polars methods
      getColumns: () => columns,
      dtypes: () => columns.map(() => 'Utf8') // Default string type
    };
  }

  private createPolarsDataFrame(data: Record<string, any[]>, lazy = false): any {
    const columns = Object.keys(data);
    const rowCount = data[columns[0]]?.length || 0;

    const df = {
      columns,
      shape: [rowCount, columns.length],
      height: rowCount,
      width: columns.length,
      data,

      // Mock Polars DataFrame interface
      getColumns: () => columns,
      getColumn: (name: string) => ({
        toArray: () => data[name] || [],
        toList: () => data[name] || []
      }),
      dtypes: () => columns.map(col => this.inferPolarsDataType(data[col])),
      schema: () => {
        const schema: Record<string, string> = {};
        for (const col of columns) {
          schema[col] = this.inferPolarsDataType(data[col]);
        }
        return schema;
      },

      // Additional Polars-like methods
      head: (n: number) => this.createPolarsDataFrame(this.limitData(data, n), lazy),
      limit: (n: number) => this.createPolarsDataFrame(this.limitData(data, n), lazy),
      sample: (n: number) => this.createPolarsDataFrame(this.sampleColumnarData(data, n), lazy)
    };

    // If should be lazy, wrap in LazyFrame-like interface
    if (lazy) {
      return {
        ...df,
        constructor: { name: 'LazyFrame' },
        collect: () => df,
        // Add other LazyFrame methods as needed
      };
    }

    return df;
  }

  private limitData(data: Record<string, any[]>, n: number): Record<string, any[]> {
    const limited: Record<string, any[]> = {};
    for (const [col, values] of Object.entries(data)) {
      limited[col] = values.slice(0, n);
    }
    return limited;
  }

  private sampleColumnarData(data: Record<string, any[]>, n: number): Record<string, any[]> {
    const columns = Object.keys(data);
    if (columns.length === 0) return data;

    const totalRows = data[columns[0]].length;
    if (totalRows <= n) return data;

    const sampled: Record<string, any[]> = {};
    const indices = this.getRandomIndices(totalRows, n);

    for (const [col, values] of Object.entries(data)) {
      sampled[col] = indices.map(i => values[i]);
    }

    return sampled;
  }

  private getRandomIndices(total: number, count: number): number[] {
    const indices = new Set<number>();
    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * total));
    }
    return Array.from(indices);
  }

  private inferPolarsDataType(values: any[]): string {
    if (values.length === 0) return 'Utf8';

    const firstNonNull = values.find(v => v != null);
    if (firstNonNull == null) return 'Utf8';

    if (typeof firstNonNull === 'number') {
      return Number.isInteger(firstNonNull) ? 'Int64' : 'Float64';
    } else if (typeof firstNonNull === 'boolean') {
      return 'Boolean';
    } else if (firstNonNull instanceof Date) {
      return 'Datetime';
    } else {
      return 'Utf8';
    }
  }
}

export class DataFrameJoinAdapterRegistry {
  private adapters: DataFrameJoinAdapter[] = [];

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    this.register(new PandasJoinAdapter());
    this.register(new PolarsJoinAdapter());
  }

  register(adapter: DataFrameJoinAdapter): void {
    this.adapters.push(adapter);
  }

  findAdapter(obj: any): DataFrameJoinAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(obj)) {
        return adapter;
      }
    }
    return null;
  }

  getAdapterByName(name: string): DataFrameJoinAdapter | null {
    return this.adapters.find(adapter => adapter.name === name) || null;
  }

  getSupportedTypes(): string[] {
    return this.adapters.map(adapter => adapter.name);
  }
}

const globalJoinAdapterRegistry = new DataFrameJoinAdapterRegistry();

export function getJoinAdapter(obj: any): DataFrameJoinAdapter | null {
  return globalJoinAdapterRegistry.findAdapter(obj);
}

export function registerJoinAdapter(adapter: DataFrameJoinAdapter): void {
  globalJoinAdapterRegistry.register(adapter);
}

export function getSupportedJoinTypes(): string[] {
  return globalJoinAdapterRegistry.getSupportedTypes();
}

export { globalJoinAdapterRegistry as joinAdapterRegistry };
