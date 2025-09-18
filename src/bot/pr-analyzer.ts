import { parse } from 'path';

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export interface SchemaChange {
  type: 'column_added' | 'column_removed' | 'column_renamed' | 'type_changed' | 'constraint_changed';
  table: string;
  column: string;
  before?: any;
  after?: any;
  confidence: number;
}

export interface SemanticFileChange {
  file: string;
  action: 'created' | 'updated' | 'deleted';
  mappings_added: number;
  mappings_removed: number;
  mappings_modified: number;
}

export interface PRAnalysisResult {
  prNumber?: number;
  hasSemanticChanges: boolean;
  schemaChanges: SchemaChange[];
  semanticFileChanges: SemanticFileChange[];
  dataFileChanges: FileChange[];
  processingTime?: number;
  riskLevel: 'low' | 'medium' | 'high';
  suggestedActions: string[];
}

export class PRAnalyzer {
  private readonly SCHEMA_FILE_PATTERNS = [
    /\.sql$/i,
    /schema.*\.py$/i,
    /models\/.*\.py$/i,
    /migrations\/.*\.(sql|py)$/i,
    /\.ddl$/i,
    /create_table.*\.(sql|py)$/i
  ];

  private readonly DATA_FILE_PATTERNS = [
    /\.csv$/i,
    /\.json$/i,
    /\.parquet$/i,
    /\.avro$/i,
    /\.xlsx?$/i,
    /data\/.*\.(py|sql)$/i
  ];

  private readonly SEMANTIC_FILE_PATTERNS = [
    /semantics\/.*\.ya?ml$/i,
    /\.semantic\.ya?ml$/i,
    /semantic-mappings\.ya?ml$/i
  ];

  async analyzePR(prData: {
    pr: any;
    diff: string;
    files: FileChange[];
  }): Promise<PRAnalysisResult> {
    const startTime = Date.now();

    const schemaChanges = this.analyzeSchemaChanges(prData.files, prData.diff);
    const semanticFileChanges = this.analyzeSemanticFileChanges(prData.files);
    const dataFileChanges = this.analyzeDataFileChanges(prData.files);

    const hasSemanticChanges = schemaChanges.length > 0 ||
      semanticFileChanges.length > 0 ||
      dataFileChanges.length > 0;

    const riskLevel = this.calculateRiskLevel(schemaChanges, dataFileChanges);
    const suggestedActions = this.generateSuggestedActions(
      schemaChanges,
      semanticFileChanges,
      dataFileChanges
    );

    return {
      prNumber: prData.pr.number,
      hasSemanticChanges,
      schemaChanges,
      semanticFileChanges,
      dataFileChanges,
      processingTime: Date.now() - startTime,
      riskLevel,
      suggestedActions
    };
  }

  private analyzeSchemaChanges(files: FileChange[], diff: string): SchemaChange[] {
    const changes: SchemaChange[] = [];

    const schemaFiles = files.filter(file =>
      this.SCHEMA_FILE_PATTERNS.some(pattern => pattern.test(file.filename))
    );

    for (const file of schemaFiles) {
      if (!file.patch) continue;

      // SQL DDL changes
      const sqlChanges = this.extractSQLSchemaChanges(file.patch, file.filename);
      changes.push(...sqlChanges);

      // Python model changes (e.g., SQLAlchemy, Django)
      if (file.filename.endsWith('.py')) {
        const pythonChanges = this.extractPythonSchemaChanges(file.patch, file.filename);
        changes.push(...pythonChanges);
      }
    }

    return changes;
  }

  private extractSQLSchemaChanges(patch: string, filename: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const lines = patch.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Column additions
      if (line.startsWith('+') && /ADD COLUMN|ADD\s+\w+/i.test(line)) {
        const match = line.match(/ADD\s+(?:COLUMN\s+)?(\w+)\s+(\w+)/i);
        if (match) {
          changes.push({
            type: 'column_added',
            table: this.extractTableName(filename, lines, i),
            column: match[1],
            after: { type: match[2] },
            confidence: 0.9
          });
        }
      }

      // Column removals
      if (line.startsWith('-') && /DROP COLUMN|DROP\s+\w+/i.test(line)) {
        const match = line.match(/DROP\s+(?:COLUMN\s+)?(\w+)/i);
        if (match) {
          changes.push({
            type: 'column_removed',
            table: this.extractTableName(filename, lines, i),
            column: match[1],
            confidence: 0.9
          });
        }
      }

      // Type changes
      if (line.startsWith('+') && line.includes('ALTER COLUMN')) {
        const match = line.match(/ALTER COLUMN\s+(\w+)\s+TYPE\s+(\w+)/i);
        if (match) {
          changes.push({
            type: 'type_changed',
            table: this.extractTableName(filename, lines, i),
            column: match[1],
            after: { type: match[2] },
            confidence: 0.85
          });
        }
      }
    }

    return changes;
  }

  private extractPythonSchemaChanges(patch: string, filename: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const lines = patch.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // SQLAlchemy column additions
      if (line.startsWith('+') && /Column\(/i.test(line)) {
        const match = line.match(/(\w+)\s*=\s*Column\((.*?)\)/);
        if (match) {
          changes.push({
            type: 'column_added',
            table: this.extractPythonTableName(filename, lines, i),
            column: match[1],
            after: { definition: match[2] },
            confidence: 0.8
          });
        }
      }

      // Column removals
      if (line.startsWith('-') && /Column\(/i.test(line)) {
        const match = line.match(/(\w+)\s*=\s*Column\(/);
        if (match) {
          changes.push({
            type: 'column_removed',
            table: this.extractPythonTableName(filename, lines, i),
            column: match[1],
            confidence: 0.8
          });
        }
      }
    }

    return changes;
  }

  private analyzeSemanticFileChanges(files: FileChange[]): SemanticFileChange[] {
    const changes: SemanticFileChange[] = [];

    const semanticFiles = files.filter(file =>
      this.SEMANTIC_FILE_PATTERNS.some(pattern => pattern.test(file.filename))
    );

    for (const file of semanticFiles) {
      let action: 'created' | 'updated' | 'deleted';
      switch (file.status) {
        case 'added':
          action = 'created';
          break;
        case 'removed':
          action = 'deleted';
          break;
        default:
          action = 'updated';
      }

      const mappingCounts = this.analyzeMappingChanges(file.patch || '');

      changes.push({
        file: file.filename,
        action,
        ...mappingCounts
      });
    }

    return changes;
  }

  private analyzeMappingChanges(patch: string): {
    mappings_added: number;
    mappings_removed: number;
    mappings_modified: number;
  } {
    const lines = patch.split('\n');
    let mappings_added = 0;
    let mappings_removed = 0;
    let mappings_modified = 0;

    for (const line of lines) {
      if (line.startsWith('+') && /semantic_type:|anchor_id:|column:/i.test(line)) {
        mappings_added++;
      } else if (line.startsWith('-') && /semantic_type:|anchor_id:|column:/i.test(line)) {
        mappings_removed++;
      }
    }

    // Heuristic: if we have both additions and removals for similar counts, they're modifications
    const modifications = Math.min(mappings_added, mappings_removed);
    mappings_modified = modifications;
    mappings_added -= modifications;
    mappings_removed -= modifications;

    return { mappings_added, mappings_removed, mappings_modified };
  }

  private analyzeDataFileChanges(files: FileChange[]): FileChange[] {
    return files.filter(file =>
      this.DATA_FILE_PATTERNS.some(pattern => pattern.test(file.filename))
    );
  }

  private extractTableName(filename: string, lines: string[], currentIndex: number): string {
    // Look backwards for CREATE TABLE or table references
    for (let i = currentIndex; i >= 0; i--) {
      const line = lines[i];
      const match = line.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i) ||
        line.match(/ALTER TABLE\s+(\w+)/i);
      if (match) {
        return match[1];
      }
    }

    // Fallback to filename
    const parsed = parse(filename);
    return parsed.name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private extractPythonTableName(filename: string, lines: string[], currentIndex: number): string {
    // Look for class definition or __tablename__
    for (let i = currentIndex; i >= 0; i--) {
      const line = lines[i];
      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch) {
        return classMatch[1].toLowerCase();
      }

      const tableMatch = line.match(/__tablename__\s*=\s*['"](\w+)['"]/);
      if (tableMatch) {
        return tableMatch[1];
      }
    }

    const parsed = parse(filename);
    return parsed.name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private calculateRiskLevel(
    schemaChanges: SchemaChange[],
    dataFileChanges: FileChange[]
  ): 'low' | 'medium' | 'high' {
    const totalChanges = schemaChanges.length + dataFileChanges.length;

    // High risk indicators
    const hasColumnRemovals = schemaChanges.some(change => change.type === 'column_removed');
    const hasTypeChanges = schemaChanges.some(change => change.type === 'type_changed');
    const hasManyDataFiles = dataFileChanges.length > 5;

    if (hasColumnRemovals || hasTypeChanges || hasManyDataFiles) {
      return 'high';
    }

    if (totalChanges > 3) {
      return 'medium';
    }

    return 'low';
  }

  private generateSuggestedActions(
    schemaChanges: SchemaChange[],
    semanticFileChanges: SemanticFileChange[],
    dataFileChanges: FileChange[]
  ): string[] {
    const actions: string[] = [];

    if (schemaChanges.length > 0) {
      actions.push('Review schema changes for semantic impact');

      if (schemaChanges.some(c => c.type === 'column_added')) {
        actions.push('Add semantic mappings for new columns');
      }

      if (schemaChanges.some(c => c.type === 'column_removed')) {
        actions.push('Remove corresponding semantic mappings');
      }

      if (schemaChanges.some(c => c.type === 'type_changed')) {
        actions.push('Validate existing mappings still apply');
      }
    }

    if (dataFileChanges.length > 0) {
      actions.push('Update column anchors for modified data files');
    }

    if (semanticFileChanges.length === 0 && (schemaChanges.length > 0 || dataFileChanges.length > 0)) {
      actions.push('Consider adding semantic mappings');
    }

    if (actions.length === 0) {
      actions.push('No semantic actions required');
    }

    return actions;
  }

  isSemanticFile(filename: string): boolean {
    return this.SEMANTIC_FILE_PATTERNS.some(pattern => pattern.test(filename));
  }

  isSchemaFile(filename: string): boolean {
    return this.SCHEMA_FILE_PATTERNS.some(pattern => pattern.test(filename));
  }

  isDataFile(filename: string): boolean {
    return this.DATA_FILE_PATTERNS.some(pattern => pattern.test(filename));
  }
}