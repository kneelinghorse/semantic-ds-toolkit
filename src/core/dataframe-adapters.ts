import { DataFrameLike } from './shadow-semantics';

export interface DataFrameAdapter<T = any> {
  readonly name: string;
  canHandle(obj: any): boolean;
  adapt(obj: T): DataFrameLike;
  getColumnNames(obj: T): string[];
  getDataTypes(obj: T): Record<string, string>;
  getShape(obj: T): [number, number];
  sampleData(obj: T, n?: number): Record<string, any[]>;
  getColumn(obj: T, columnName: string): any[];
}

export class PandasDataFrameAdapter implements DataFrameAdapter {
  readonly name = 'pandas';

  canHandle(obj: any): boolean {
    return obj && typeof obj === 'object' &&
           obj.constructor && obj.constructor.name === 'DataFrame' &&
           typeof obj.columns !== 'undefined' &&
           typeof obj.dtypes !== 'undefined';
  }

  adapt(df: any): DataFrameLike {
    return {
      columns: this.getColumnNames(df),
      dtypes: this.getDataTypes(df),
      shape: this.getShape(df),
      sample: (n = 100) => this.sampleData(df, n),
      getColumn: (name: string) => this.getColumn(df, name)
    };
  }

  getColumnNames(df: any): string[] {
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

  getDataTypes(df: any): Record<string, string> {
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

  getShape(df: any): [number, number] {
    if (Array.isArray(df.shape) && df.shape.length >= 2) {
      return [df.shape[0], df.shape[1]];
    }

    const columns = this.getColumnNames(df);
    const rowCount = df.length || 0;
    return [rowCount, columns.length];
  }

  sampleData(df: any, n = 100): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    const columns = this.getColumnNames(df);

    for (const col of columns) {
      result[col] = this.getColumn(df, col).slice(0, n);
    }

    return result;
  }

  getColumn(df: any, columnName: string): any[] {
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
}

export class PolarsDataFrameAdapter implements DataFrameAdapter {
  readonly name = 'polars';

  canHandle(obj: any): boolean {
    return obj && typeof obj === 'object' &&
           obj.constructor && obj.constructor.name === 'DataFrame' &&
           typeof obj.getColumns === 'function' &&
           typeof obj.dtypes === 'function';
  }

  adapt(df: any): DataFrameLike {
    return {
      columns: this.getColumnNames(df),
      dtypes: this.getDataTypes(df),
      shape: this.getShape(df),
      sample: (n = 100) => this.sampleData(df, n),
      getColumn: (name: string) => this.getColumn(df, name)
    };
  }

  getColumnNames(df: any): string[] {
    if (typeof df.getColumns === 'function') {
      return df.getColumns();
    }
    if (df.columns && Array.isArray(df.columns)) {
      return df.columns;
    }
    return [];
  }

  getDataTypes(df: any): Record<string, string> {
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
    }

    return result;
  }

  getShape(df: any): [number, number] {
    const height = typeof df.height === 'number' ? df.height : 0;
    const width = typeof df.width === 'number' ? df.width : this.getColumnNames(df).length;
    return [height, width];
  }

  sampleData(df: any, n = 100): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    const columns = this.getColumnNames(df);

    let sampledDf = df;
    if (typeof df.sample === 'function') {
      sampledDf = df.sample(n);
    } else if (typeof df.head === 'function') {
      sampledDf = df.head(n);
    }

    for (const col of columns) {
      result[col] = this.getColumn(sampledDf, col);
    }

    return result;
  }

  getColumn(df: any, columnName: string): any[] {
    if (typeof df.getColumn === 'function') {
      const column = df.getColumn(columnName);
      if (column && typeof column.toArray === 'function') {
        return column.toArray();
      }
      if (Array.isArray(column)) {
        return column;
      }
    }

    return [];
  }
}

export class DuckDBDataFrameAdapter implements DataFrameAdapter {
  readonly name = 'duckdb';

  canHandle(obj: any): boolean {
    return obj && typeof obj === 'object' &&
           (obj.constructor.name === 'DuckDBResult' || obj.constructor.name === 'QueryResult') &&
           Array.isArray(obj.columns);
  }

  adapt(df: any): DataFrameLike {
    return {
      columns: this.getColumnNames(df),
      dtypes: this.getDataTypes(df),
      shape: this.getShape(df),
      sample: (n = 100) => this.sampleData(df, n),
      getColumn: (name: string) => this.getColumn(df, name)
    };
  }

  getColumnNames(df: any): string[] {
    if (Array.isArray(df.columns)) {
      return df.columns.map((col: any) =>
        typeof col === 'string' ? col : col.name || String(col)
      );
    }
    return [];
  }

  getDataTypes(df: any): Record<string, string> {
    const result: Record<string, string> = {};
    const columns = this.getColumnNames(df);

    if (Array.isArray(df.columns)) {
      df.columns.forEach((col: any, i: number) => {
        const colName = columns[i];
        if (col && typeof col === 'object' && col.type) {
          result[colName] = String(col.type);
        } else {
          result[colName] = 'unknown';
        }
      });
    }

    return result;
  }

  getShape(df: any): [number, number] {
    const rows = Array.isArray(df.data) ? df.data.length : 0;
    const cols = this.getColumnNames(df).length;
    return [rows, cols];
  }

  sampleData(df: any, n = 100): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    const columns = this.getColumnNames(df);

    for (const col of columns) {
      result[col] = this.getColumn(df, col).slice(0, n);
    }

    return result;
  }

  getColumn(df: any, columnName: string): any[] {
    const colIndex = this.getColumnNames(df).indexOf(columnName);
    if (colIndex === -1 || !Array.isArray(df.data)) {
      return [];
    }

    return df.data.map((row: any) =>
      Array.isArray(row) ? row[colIndex] : (row && row[columnName])
    ).filter((val: any) => val !== undefined);
  }
}

export class PlainObjectAdapter implements DataFrameAdapter {
  readonly name = 'plain_object';

  canHandle(obj: any): boolean {
    return obj && typeof obj === 'object' && !Array.isArray(obj) &&
           Object.values(obj).every((val: any) => Array.isArray(val));
  }

  adapt(obj: any): DataFrameLike {
    return {
      columns: this.getColumnNames(obj),
      dtypes: this.getDataTypes(obj),
      shape: this.getShape(obj),
      sample: (n = 100) => this.sampleData(obj, n),
      getColumn: (name: string) => this.getColumn(obj, name)
    };
  }

  getColumnNames(obj: any): string[] {
    return Object.keys(obj);
  }

  getDataTypes(obj: any): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [col, values] of Object.entries(obj)) {
      if (Array.isArray(values) && values.length > 0) {
        const firstValue = values.find(v => v != null);
        if (firstValue !== undefined) {
          result[col] = this.inferType(firstValue);
        } else {
          result[col] = 'unknown';
        }
      } else {
        result[col] = 'unknown';
      }
    }

    return result;
  }

  getShape(obj: any): [number, number] {
    const columns = this.getColumnNames(obj);
    if (columns.length === 0) return [0, 0];

    const firstCol = obj[columns[0]];
    const rows = Array.isArray(firstCol) ? firstCol.length : 0;
    return [rows, columns.length];
  }

  sampleData(obj: any, n = 100): Record<string, any[]> {
    const result: Record<string, any[]> = {};

    for (const [col, values] of Object.entries(obj)) {
      if (Array.isArray(values)) {
        result[col] = values.slice(0, n);
      } else {
        result[col] = [];
      }
    }

    return result;
  }

  getColumn(obj: any, columnName: string): any[] {
    const values = obj[columnName];
    return Array.isArray(values) ? values : [];
  }

  private inferType(value: any): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int64' : 'float64';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (value instanceof Date) {
      return 'datetime';
    }
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return 'datetime';
      }
      return 'string';
    }
    return 'unknown';
  }
}

export class ArrayOfObjectsAdapter implements DataFrameAdapter {
  readonly name = 'array_of_objects';

  canHandle(obj: any): boolean {
    return Array.isArray(obj) && obj.length > 0 &&
           obj.every(item => item && typeof item === 'object' && !Array.isArray(item));
  }

  adapt(arr: any[]): DataFrameLike {
    return {
      columns: this.getColumnNames(arr),
      dtypes: this.getDataTypes(arr),
      shape: this.getShape(arr),
      sample: (n = 100) => this.sampleData(arr, n),
      getColumn: (name: string) => this.getColumn(arr, name)
    };
  }

  getColumnNames(arr: any[]): string[] {
    if (arr.length === 0) return [];

    const allKeys = new Set<string>();
    for (const obj of arr) {
      Object.keys(obj).forEach(key => allKeys.add(key));
    }

    return Array.from(allKeys).sort();
  }

  getDataTypes(arr: any[]): Record<string, string> {
    const result: Record<string, string> = {};
    const columns = this.getColumnNames(arr);

    for (const col of columns) {
      for (const obj of arr) {
        const value = obj[col];
        if (value != null) {
          result[col] = this.inferType(value);
          break;
        }
      }
      if (!result[col]) {
        result[col] = 'unknown';
      }
    }

    return result;
  }

  getShape(arr: any[]): [number, number] {
    return [arr.length, this.getColumnNames(arr).length];
  }

  sampleData(arr: any[], n = 100): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    const columns = this.getColumnNames(arr);
    const sample = arr.slice(0, n);

    for (const col of columns) {
      result[col] = sample.map(obj => obj[col]);
    }

    return result;
  }

  getColumn(arr: any[], columnName: string): any[] {
    return arr.map(obj => obj[columnName]);
  }

  private inferType(value: any): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int64' : 'float64';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (value instanceof Date) {
      return 'datetime';
    }
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return 'datetime';
      }
      return 'string';
    }
    return 'unknown';
  }
}

export class DataFrameAdapterRegistry {
  private adapters: DataFrameAdapter[] = [];

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    this.register(new PandasDataFrameAdapter());
    this.register(new PolarsDataFrameAdapter());
    this.register(new DuckDBDataFrameAdapter());
    this.register(new PlainObjectAdapter());
    this.register(new ArrayOfObjectsAdapter());
  }

  register(adapter: DataFrameAdapter): void {
    this.adapters.push(adapter);
  }

  findAdapter(obj: any): DataFrameAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(obj)) {
        return adapter;
      }
    }
    return null;
  }

  adapt(obj: any): DataFrameLike | null {
    const adapter = this.findAdapter(obj);
    if (adapter) {
      return adapter.adapt(obj);
    }
    return null;
  }

  getSupportedTypes(): string[] {
    return this.adapters.map(adapter => adapter.name);
  }

  getAdapter(name: string): DataFrameAdapter | null {
    return this.adapters.find(adapter => adapter.name === name) || null;
  }
}

const globalRegistry = new DataFrameAdapterRegistry();

export function adaptDataFrame(obj: any): DataFrameLike | null {
  return globalRegistry.adapt(obj);
}

export function registerAdapter(adapter: DataFrameAdapter): void {
  globalRegistry.register(adapter);
}

export function getSupportedDataFrameTypes(): string[] {
  return globalRegistry.getSupportedTypes();
}

export function getAdapterForType(typeName: string): DataFrameAdapter | null {
  return globalRegistry.getAdapter(typeName);
}

export { globalRegistry as dataFrameRegistry };