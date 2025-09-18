import {
  ShadowSemanticsLayer,
  DataFrameLike,
  SemanticContext,
  SemanticAttachment,
  ShadowSemanticOptions
} from './shadow-semantics';
import {
  SmartAnchorReconciler,
  EnhancedReconciliationResult,
  ConfidenceMetrics
} from './reconciler';
import {
  StableColumnAnchor,
  AnchorReconciliationResult,
  ReconciliationOptions,
  ColumnData
} from '../types/anchor.types';

export interface AttachmentResult {
  dataframe_id: string;
  semantic_attachments: SemanticAttachment[];
  reconciliation_result: EnhancedReconciliationResult;
  performance_metrics: {
    attachment_time_ms: number;
    reconciliation_time_ms: number;
    total_columns: number;
    matched_columns: number;
  };
}

export interface ReconciliationResult {
  reconciliation_result: EnhancedReconciliationResult;
  confidence_metrics: ConfidenceMetrics;
  performance_metrics: {
    reconciliation_time_ms: number;
    strategy_used: string;
  };
}

class ShadowSemanticsAPI {
  private shadowLayer: ShadowSemanticsLayer;
  private reconciler: SmartAnchorReconciler;

  constructor(options?: Partial<ShadowSemanticOptions>) {
    this.shadowLayer = new ShadowSemanticsLayer(options);
    this.reconciler = new SmartAnchorReconciler();
  }

  attachSemanticsShadow(
    dataframe: DataFrameLike,
    options: {
      dataset_name?: string;
      force_recompute?: boolean;
      custom_semantics?: Record<string, Partial<SemanticContext>>;
      reconciliation_strategy?: string;
      confidence_threshold?: number;
    } = {}
  ): AttachmentResult {
    const startTime = Date.now();

    const shadowResult = this.shadowLayer.attachSemanticsShadow(dataframe, {
      dataset_name: options.dataset_name,
      force_recompute: options.force_recompute,
      custom_semantics: options.custom_semantics
    });

    const attachmentTime = Date.now() - startTime;

    const columns = this.convertDataFrameToColumns(dataframe);
    const existingAnchors = this.getExistingAnchors(options.dataset_name || `dataset_${shadowResult.dataframe_id}`);

    const enhancedReconciliation = this.reconciler.reconcileAnchorsAdvanced(
      options.dataset_name || `dataset_${shadowResult.dataframe_id}`,
      columns,
      existingAnchors,
      options.reconciliation_strategy || 'balanced',
      {
        confidence_threshold: options.confidence_threshold
      }
    );

    return {
      dataframe_id: shadowResult.dataframe_id,
      semantic_attachments: shadowResult.semantic_attachments,
      reconciliation_result: enhancedReconciliation,
      performance_metrics: {
        attachment_time_ms: attachmentTime,
        reconciliation_time_ms: enhancedReconciliation.reconciliation_time_ms,
        total_columns: dataframe.columns.length,
        matched_columns: enhancedReconciliation.matched_anchors.length
      }
    };
  }

  reconcileAnchors(
    datasetName: string,
    newColumns: ColumnData[],
    existingAnchors: StableColumnAnchor[],
    options: {
      strategy?: string;
      confidence_threshold?: number;
      drift_tolerance?: number;
      allow_multiple_matches?: boolean;
      create_new_anchors?: boolean;
    } = {}
  ): ReconciliationResult {
    const startTime = Date.now();

    const reconciliationResult = this.reconciler.reconcileAnchorsAdvanced(
      datasetName,
      newColumns,
      existingAnchors,
      options.strategy || 'balanced',
      {
        confidence_threshold: options.confidence_threshold,
        drift_tolerance: options.drift_tolerance,
        allow_multiple_matches: options.allow_multiple_matches,
        create_new_anchors: options.create_new_anchors
      }
    );

    const reconciliationTime = Date.now() - startTime;

    return {
      reconciliation_result: reconciliationResult,
      confidence_metrics: reconciliationResult.confidence_metrics,
      performance_metrics: {
        reconciliation_time_ms: reconciliationTime,
        strategy_used: reconciliationResult.strategy_used
      }
    };
  }

  getSemanticContext(
    dataframeId: string,
    columnName: string
  ): SemanticContext | null {
    return this.shadowLayer.getSemanticContext(dataframeId, columnName);
  }

  getAllSemanticContexts(dataframeId: string): Record<string, SemanticContext> {
    const attachments = this.shadowLayer.listSemanticAttachments(dataframeId);
    const contexts: Record<string, SemanticContext> = {};

    for (const attachment of attachments) {
      contexts[attachment.column_name] = attachment.semantic_context;
    }

    return contexts;
  }

  updateSemanticContext(
    dataframeId: string,
    columnName: string,
    updates: Partial<SemanticContext>
  ): boolean {
    return this.shadowLayer.updateSemanticContext(dataframeId, columnName, updates);
  }

  removeSemanticAttachment(dataframeId: string, columnName: string): boolean {
    return this.shadowLayer.removeSemanticAttachment(dataframeId, columnName);
  }

  exportSemanticMappings(dataframeId?: string): Record<string, SemanticAttachment> {
    return this.shadowLayer.exportSemanticMappings(dataframeId);
  }

  importSemanticMappings(
    mappings: Record<string, SemanticAttachment>,
    dataframeId: string
  ): void {
    this.shadowLayer.importSemanticMappings(mappings, dataframeId);
  }

  getReconciliationStrategies(): string[] {
    return this.reconciler.getReconciliationStrategies();
  }

  analyzeDataFrameCompatibility(
    dataframe1: DataFrameLike,
    dataframe2: DataFrameLike
  ): {
    compatibility_score: number;
    common_columns: string[];
    unique_to_df1: string[];
    unique_to_df2: string[];
    type_mismatches: Array<{
      column: string;
      df1_type: string;
      df2_type: string;
    }>;
    recommendations: string[];
  } {
    const df1Columns = new Set(dataframe1.columns);
    const df2Columns = new Set(dataframe2.columns);

    const commonColumns = dataframe1.columns.filter(col => df2Columns.has(col));
    const uniqueToDf1 = dataframe1.columns.filter(col => !df2Columns.has(col));
    const uniqueToDf2 = dataframe2.columns.filter(col => !df1Columns.has(col));

    const typeMismatches: Array<{
      column: string;
      df1_type: string;
      df2_type: string;
    }> = [];

    for (const col of commonColumns) {
      const df1Type = dataframe1.dtypes[col];
      const df2Type = dataframe2.dtypes[col];
      if (df1Type !== df2Type) {
        typeMismatches.push({
          column: col,
          df1_type: df1Type,
          df2_type: df2Type
        });
      }
    }

    const totalColumns = Math.max(dataframe1.columns.length, dataframe2.columns.length);
    const compatibilityScore = commonColumns.length / totalColumns;

    const recommendations: string[] = [];
    if (compatibilityScore < 0.7) {
      recommendations.push('Low schema compatibility detected');
      recommendations.push('Consider schema alignment before semantic attachment');
    }
    if (typeMismatches.length > 0) {
      recommendations.push('Type mismatches found in common columns');
      recommendations.push('Review data types for semantic consistency');
    }
    if (uniqueToDf1.length > commonColumns.length || uniqueToDf2.length > commonColumns.length) {
      recommendations.push('Significant schema differences detected');
      recommendations.push('Enable new anchor creation for unique columns');
    }

    return {
      compatibility_score: compatibilityScore,
      common_columns: commonColumns,
      unique_to_df1: uniqueToDf1,
      unique_to_df2: uniqueToDf2,
      type_mismatches: typeMismatches,
      recommendations: recommendations
    };
  }

  private convertDataFrameToColumns(dataframe: DataFrameLike): ColumnData[] {
    const sampleData = dataframe.sample(1000);

    return dataframe.columns.map(columnName => {
      const values = sampleData[columnName] || [];
      const dataType = this.mapDataType(dataframe.dtypes[columnName] || 'unknown');

      return {
        name: columnName,
        values: values,
        data_type: dataType
      };
    });
  }

  private mapDataType(dtype: string): 'string' | 'int64' | 'float64' | 'boolean' | 'datetime' | 'unknown' {
    const lower = dtype.toLowerCase();
    if (lower.includes('int')) return 'int64';
    if (lower.includes('float') || lower.includes('double')) return 'float64';
    if (lower.includes('bool')) return 'boolean';
    if (lower.includes('date') || lower.includes('time')) return 'datetime';
    if (lower.includes('str') || lower.includes('object')) return 'string';
    return 'unknown';
  }

  private getExistingAnchors(datasetName: string): StableColumnAnchor[] {
    return [];
  }
}

let globalShadowAPI: ShadowSemanticsAPI | null = null;

export function attachSemanticsShadow(
  dataframe: DataFrameLike,
  options: {
    dataset_name?: string;
    force_recompute?: boolean;
    custom_semantics?: Record<string, Partial<SemanticContext>>;
    reconciliation_strategy?: string;
    confidence_threshold?: number;
    shadow_options?: Partial<ShadowSemanticOptions>;
  } = {}
): AttachmentResult {
  if (!globalShadowAPI) {
    globalShadowAPI = new ShadowSemanticsAPI(options.shadow_options);
  }

  return globalShadowAPI.attachSemanticsShadow(dataframe, options);
}

export function reconcileAnchors(
  datasetName: string,
  newColumns: ColumnData[],
  existingAnchors: StableColumnAnchor[],
  options: {
    strategy?: string;
    confidence_threshold?: number;
    drift_tolerance?: number;
    allow_multiple_matches?: boolean;
    create_new_anchors?: boolean;
  } = {}
): ReconciliationResult {
  if (!globalShadowAPI) {
    globalShadowAPI = new ShadowSemanticsAPI();
  }

  return globalShadowAPI.reconcileAnchors(datasetName, newColumns, existingAnchors, options);
}

export function getSemanticContext(
  dataframeId: string,
  columnName: string
): SemanticContext | null {
  if (!globalShadowAPI) {
    return null;
  }

  return globalShadowAPI.getSemanticContext(dataframeId, columnName);
}

export function getAllSemanticContexts(dataframeId: string): Record<string, SemanticContext> {
  if (!globalShadowAPI) {
    return {};
  }

  return globalShadowAPI.getAllSemanticContexts(dataframeId);
}

export function updateSemanticContext(
  dataframeId: string,
  columnName: string,
  updates: Partial<SemanticContext>
): boolean {
  if (!globalShadowAPI) {
    return false;
  }

  return globalShadowAPI.updateSemanticContext(dataframeId, columnName, updates);
}

export function removeSemanticAttachment(dataframeId: string, columnName: string): boolean {
  if (!globalShadowAPI) {
    return false;
  }

  return globalShadowAPI.removeSemanticAttachment(dataframeId, columnName);
}

export function exportSemanticMappings(dataframeId?: string): Record<string, SemanticAttachment> {
  if (!globalShadowAPI) {
    return {};
  }

  return globalShadowAPI.exportSemanticMappings(dataframeId);
}

export function importSemanticMappings(
  mappings: Record<string, SemanticAttachment>,
  dataframeId: string
): void {
  if (!globalShadowAPI) {
    globalShadowAPI = new ShadowSemanticsAPI();
  }

  globalShadowAPI.importSemanticMappings(mappings, dataframeId);
}

export function analyzeDataFrameCompatibility(
  dataframe1: DataFrameLike,
  dataframe2: DataFrameLike
): {
  compatibility_score: number;
  common_columns: string[];
  unique_to_df1: string[];
  unique_to_df2: string[];
  type_mismatches: Array<{
    column: string;
    df1_type: string;
    df2_type: string;
  }>;
  recommendations: string[];
} {
  if (!globalShadowAPI) {
    globalShadowAPI = new ShadowSemanticsAPI();
  }

  return globalShadowAPI.analyzeDataFrameCompatibility(dataframe1, dataframe2);
}

export function getReconciliationStrategies(): string[] {
  if (!globalShadowAPI) {
    globalShadowAPI = new ShadowSemanticsAPI();
  }

  return globalShadowAPI.getReconciliationStrategies();
}

export function resetShadowAPI(): void {
  globalShadowAPI = null;
}

export { ShadowSemanticsAPI };