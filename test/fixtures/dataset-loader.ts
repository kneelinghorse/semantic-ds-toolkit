import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TestDatasetConfig, getDatasetByName } from './test-datasets.config';

export interface LoadedDataset {
  name: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  metadata: {
    rowCount: number;
    columnCount: number;
    nullCount: number;
    nullPercentage: number;
    dataTypes: Record<string, string>;
  };
}

export class DatasetLoader {
  private static cache: Map<string, LoadedDataset> = new Map();

  static async loadDataset(nameOrPath: string): Promise<LoadedDataset> {
    // Check cache first
    if (this.cache.has(nameOrPath)) {
      return this.cache.get(nameOrPath)!;
    }

    let filePath: string;
    let datasetName: string;

    // Check if it's a dataset name or file path
    if (nameOrPath.includes('/') || nameOrPath.endsWith('.csv')) {
      filePath = nameOrPath;
      datasetName = nameOrPath.split('/').pop()?.replace('.csv', '') || nameOrPath;
    } else {
      const config = getDatasetByName(nameOrPath);
      if (!config) {
        throw new Error(`Dataset '${nameOrPath}' not found in configuration`);
      }
      filePath = join(process.cwd(), config.path);
      datasetName = config.name;
    }

    if (!existsSync(filePath)) {
      throw new Error(`Dataset file not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const dataset = this.parseCSV(content, datasetName);

    // Cache the result
    this.cache.set(nameOrPath, dataset);
    this.cache.set(datasetName, dataset);

    return dataset;
  }

  static loadMultipleDatasets(names: string[]): Promise<LoadedDataset[]> {
    return Promise.all(names.map(name => this.loadDataset(name)));
  }

  static clearCache(): void {
    this.cache.clear();
  }

  static getCacheSize(): number {
    return this.cache.size;
  }

  private static parseCSV(content: string, name: string): LoadedDataset {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const rows: Array<Record<string, any>> = [];
    let nullCount = 0;
    const dataTypes: Record<string, Set<string>> = {};

    // Initialize data type tracking
    headers.forEach(header => {
      dataTypes[header] = new Set();
    });

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row: Record<string, any> = {};

      headers.forEach((header, index) => {
        let value = values[index] || null;

        // Handle null/empty values
        if (value === '' || value === 'null' || value === 'NULL' || value === undefined) {
          value = null;
          nullCount++;
        } else if (value !== null) {
          // Trim whitespace
          const stringValue = value.toString().trim();

          // Attempt type inference - keep as strings for consistency
          if (stringValue === 'true' || stringValue === 'false') {
            value = stringValue;
            dataTypes[header].add('boolean');
          } else if (/^\d+$/.test(stringValue)) {
            value = stringValue;
            dataTypes[header].add('integer');
          } else if (/^\d+\.\d+$/.test(stringValue)) {
            value = stringValue;
            dataTypes[header].add('float');
          } else if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) {
            value = stringValue;
            dataTypes[header].add('datetime');
          } else if (/@/.test(stringValue)) {
            value = stringValue;
            dataTypes[header].add('email');
          } else if (/^\+?[\d\s\-\(\)\.]+$/.test(stringValue) && stringValue.length > 7) {
            value = stringValue;
            dataTypes[header].add('phone');
          } else {
            value = stringValue;
            dataTypes[header].add('string');
          }
        }

        row[header] = value;
      });

      rows.push(row);
    }

    // Determine primary data type for each column
    const finalDataTypes: Record<string, string> = {};
    headers.forEach(header => {
      const types = Array.from(dataTypes[header]);
      if (types.length === 0) {
        finalDataTypes[header] = 'null';
      } else if (types.includes('datetime')) {
        finalDataTypes[header] = 'datetime';
      } else if (types.includes('email')) {
        finalDataTypes[header] = 'email';
      } else if (types.includes('phone')) {
        finalDataTypes[header] = 'phone';
      } else if (types.includes('float')) {
        finalDataTypes[header] = 'float';
      } else if (types.includes('integer')) {
        finalDataTypes[header] = 'integer';
      } else if (types.includes('boolean')) {
        finalDataTypes[header] = 'boolean';
      } else {
        finalDataTypes[header] = 'string';
      }
    });

    const totalCells = rows.length * headers.length;
    const nullPercentage = totalCells > 0 ? nullCount / totalCells : 0;

    return {
      name,
      columns: headers,
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: headers.length,
        nullCount,
        nullPercentage,
        dataTypes: finalDataTypes
      }
    };
  }

  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result.map(field => field.replace(/^"(.*)"$/, '$1'));
  }

  static async validateDatasetQuality(dataset: LoadedDataset): Promise<{
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    // Check null percentage
    if (dataset.metadata.nullPercentage > 0.5) {
      issues.push(`High null percentage: ${(dataset.metadata.nullPercentage * 100).toFixed(1)}%`);
      recommendations.push('Consider data cleaning or imputation strategies');
      score -= 0.3;
    } else if (dataset.metadata.nullPercentage > 0.2) {
      issues.push(`Moderate null percentage: ${(dataset.metadata.nullPercentage * 100).toFixed(1)}%`);
      score -= 0.1;
    }

    // Check for duplicate rows
    const uniqueRows = new Set(dataset.rows.map(row => JSON.stringify(row)));
    const duplicatePercentage = 1 - (uniqueRows.size / dataset.rows.length);
    if (duplicatePercentage > 0.1) {
      issues.push(`High duplicate row percentage: ${(duplicatePercentage * 100).toFixed(1)}%`);
      recommendations.push('Remove duplicate rows to improve data quality');
      score -= 0.2;
    }

    // Check column name quality
    const problematicColumns = dataset.columns.filter(col =>
      col.length < 2 || col.includes(' ') || /[^a-zA-Z0-9_]/.test(col)
    );
    if (problematicColumns.length > 0) {
      issues.push(`Problematic column names: ${problematicColumns.join(', ')}`);
      recommendations.push('Use standardized column naming conventions');
      score -= 0.1;
    }

    // Check for potential semantic consistency
    const emailColumns = Object.entries(dataset.metadata.dataTypes)
      .filter(([_, type]) => type === 'email')
      .map(([col, _]) => col);

    for (const emailCol of emailColumns) {
      const emailValues = dataset.rows
        .map(row => row[emailCol])
        .filter(val => val !== null);

      const invalidEmails = emailValues.filter(email =>
        typeof email === 'string' && !email.includes('@')
      );

      if (invalidEmails.length > emailValues.length * 0.1) {
        issues.push(`Invalid email formats in column '${emailCol}'`);
        score -= 0.1;
      }
    }

    score = Math.max(0, score); // Ensure score doesn't go below 0

    return { score, issues, recommendations };
  }

  static getDatasetSummary(dataset: LoadedDataset): string {
    const { metadata } = dataset;
    const dataTypeCounts = Object.values(metadata.dataTypes).reduce((counts, type) => {
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return `Dataset: ${dataset.name}
Dimensions: ${metadata.rowCount} rows × ${metadata.columnCount} columns
Null percentage: ${(metadata.nullPercentage * 100).toFixed(1)}%
Data types: ${Object.entries(dataTypeCounts).map(([type, count]) => `${type}(${count})`).join(', ')}`;
  }
}