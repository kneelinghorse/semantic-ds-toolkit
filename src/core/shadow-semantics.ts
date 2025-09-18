import {
  StableColumnAnchor,
  ColumnData,
  DataType,
  AnchorReconciliationResult,
  ReconciliationOptions
} from '../types/anchor.types';
import { StableColumnAnchorSystem } from './anchors';

export interface SemanticContext {
  anchor_id: string;
  semantic_type: string;
  confidence: number;
  metadata: Record<string, any>;
  inferred_relations: string[];
  domain_specific_tags: string[];
}

export interface ShadowSemanticOptions {
  confidence_threshold: number;
  auto_inference: boolean;
  preserve_original: boolean;
  enable_caching: boolean;
  semantic_domains: string[];
}

export interface DataFrameLike {
  columns: string[];
  dtypes: Record<string, string>;
  shape: [number, number];
  sample: (n?: number) => Record<string, any[]>;
  getColumn: (name: string) => any[];
}

export interface SemanticAttachment {
  column_name: string;
  semantic_context: SemanticContext;
  attachment_timestamp: string;
  confidence_score: number;
  auto_inferred: boolean;
}

export class ShadowSemanticsLayer {
  private anchorSystem: StableColumnAnchorSystem;
  private semanticAttachments: Map<string, SemanticAttachment> = new Map();
  private dataframeCache: Map<string, DataFrameLike> = new Map();
  private options: ShadowSemanticOptions;

  constructor(options: Partial<ShadowSemanticOptions> = {}) {
    this.anchorSystem = new StableColumnAnchorSystem();
    this.options = {
      confidence_threshold: 0.5,
      auto_inference: true,
      preserve_original: true,
      enable_caching: true,
      semantic_domains: ['financial', 'healthcare', 'retail', 'identity', 'temporal'],
      ...options
    };
  }

  attachSemanticsShadow(
    dataframe: DataFrameLike,
    options: Partial<{
      dataset_name: string;
      force_recompute: boolean;
      custom_semantics: Record<string, Partial<SemanticContext>>;
    }> = {}
  ): {
    semantic_attachments: SemanticAttachment[];
    reconciliation_result: AnchorReconciliationResult;
    dataframe_id: string;
  } {
    const dataframeId = this.generateDataframeId(dataframe);
    const datasetName = options.dataset_name || `dataset_${dataframeId}`;

    if (this.options.enable_caching && !options.force_recompute) {
      this.dataframeCache.set(dataframeId, dataframe);
    }

    const columns = this.convertToColumnData(dataframe);
    const existingAnchors = this.getExistingAnchors(datasetName);

    const reconciliationOptions: ReconciliationOptions = {
      confidence_threshold: this.options.confidence_threshold,
      allow_multiple_matches: false,
      create_new_anchors: true,
      drift_tolerance: 0.2
    };

    const reconciliationResult = this.anchorSystem.reconcileAnchors(
      datasetName,
      columns,
      existingAnchors,
      reconciliationOptions
    );

    const semanticAttachments: SemanticAttachment[] = [];

    for (const column of columns) {
      let semanticContext: SemanticContext;
      let confidence = 0;
      let autoInferred = false;

      if (options.custom_semantics && options.custom_semantics[column.name]) {
        semanticContext = this.buildSemanticContext(
          column,
          options.custom_semantics[column.name]
        );
        confidence = options.custom_semantics[column.name].confidence || 1.0;
      } else if (this.options.auto_inference) {
        const inferredContext = this.inferSemanticContext(column, reconciliationResult);
        semanticContext = inferredContext.context;
        confidence = inferredContext.confidence;
        autoInferred = true;
      } else {
        semanticContext = this.createBasicSemanticContext(column);
        confidence = 0.5;
      }

      if (confidence >= this.options.confidence_threshold || !autoInferred) {
        const attachment: SemanticAttachment = {
          column_name: column.name,
          semantic_context: semanticContext,
          attachment_timestamp: new Date().toISOString(),
          confidence_score: confidence,
          auto_inferred: autoInferred
        };

        semanticAttachments.push(attachment);
        this.semanticAttachments.set(`${dataframeId}_${column.name}`, attachment);
      }
    }

    return {
      semantic_attachments: semanticAttachments,
      reconciliation_result: reconciliationResult,
      dataframe_id: dataframeId
    };
  }

  getSemanticContext(
    dataframeId: string,
    columnName: string
  ): SemanticContext | null {
    const key = `${dataframeId}_${columnName}`;
    const attachment = this.semanticAttachments.get(key);
    return attachment ? attachment.semantic_context : null;
  }

  listSemanticAttachments(dataframeId?: string): SemanticAttachment[] {
    if (dataframeId) {
      return Array.from(this.semanticAttachments.entries())
        .filter(([key, _]) => key.startsWith(`${dataframeId}_`))
        .map(([_, attachment]) => attachment);
    }
    return Array.from(this.semanticAttachments.values());
  }

  removeSemanticAttachment(dataframeId: string, columnName: string): boolean {
    const key = `${dataframeId}_${columnName}`;
    return this.semanticAttachments.delete(key);
  }

  updateSemanticContext(
    dataframeId: string,
    columnName: string,
    updates: Partial<SemanticContext>
  ): boolean {
    const key = `${dataframeId}_${columnName}`;
    const attachment = this.semanticAttachments.get(key);

    if (attachment) {
      attachment.semantic_context = {
        ...attachment.semantic_context,
        ...updates
      };
      attachment.attachment_timestamp = new Date().toISOString();
      return true;
    }
    return false;
  }

  private generateDataframeId(dataframe: DataFrameLike): string {
    const signature = {
      columns: dataframe.columns.sort(),
      shape: dataframe.shape,
      dtypes: Object.keys(dataframe.dtypes).sort().map(k => `${k}:${dataframe.dtypes[k]}`)
    };

    const hashInput = JSON.stringify(signature);
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `df_${Math.abs(hash).toString(16)}`;
  }

  private convertToColumnData(dataframe: DataFrameLike): ColumnData[] {
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

  private mapDataType(dtype: string): DataType {
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

  private inferSemanticContext(
    column: ColumnData,
    reconciliationResult: AnchorReconciliationResult
  ): { context: SemanticContext; confidence: number } {
    const matchedAnchor = reconciliationResult.matched_anchors.find(
      ma => ma.column_name === column.name
    );

    let semanticType = this.inferSemanticType(column);
    let confidence = 0.6;
    let anchorId = '';

    if (matchedAnchor) {
      anchorId = matchedAnchor.anchor_id;
      confidence = Math.max(confidence, matchedAnchor.confidence);
      semanticType = this.enhanceSemanticTypeFromAnchor(semanticType, matchedAnchor);
    }

    const inferredRelations = this.inferRelations(column, semanticType);
    const domainTags = this.inferDomainTags(column, semanticType);

    return {
      context: {
        anchor_id: anchorId,
        semantic_type: semanticType,
        confidence: confidence,
        metadata: {
          data_type: column.data_type,
          cardinality: new Set(column.values).size,
          null_ratio: column.values.filter(v => v == null).length / column.values.length
        },
        inferred_relations: inferredRelations,
        domain_specific_tags: domainTags
      },
      confidence: confidence
    };
  }

  private inferSemanticType(column: ColumnData): string {
    const name = column.name.toLowerCase();
    const values = column.values.slice(0, 100);

    if (/(^|_)(id|pk|key)$/i.test(name)) return 'identifier';
    if (/(^|_)(email|mail)$/i.test(name)) return 'email_address';
    if (/(^|_)(phone|tel|mobile)$/i.test(name)) return 'phone_number';
    if (/(^|_)(name|title|label)$/i.test(name)) return 'display_name';
    if (/(^|_)(amount|price|cost|value)$/i.test(name)) return 'monetary_value';
    if (/(^|_)(date|time|timestamp)$/i.test(name)) return 'temporal';
    if (/(^|_)(code|cd|abbr)$/i.test(name)) return 'categorical_code';

    if (column.data_type === 'datetime') return 'temporal';
    if (column.data_type === 'boolean') return 'boolean_flag';

    const uniqueRatio = new Set(values).size / values.length;
    if (uniqueRatio > 0.9) return 'high_cardinality_attribute';
    if (uniqueRatio < 0.1) return 'categorical_attribute';

    return 'generic_attribute';
  }

  private enhanceSemanticTypeFromAnchor(
    baseType: string,
    matchedAnchor: { match_reason: string[] }
  ): string {
    if (matchedAnchor.match_reason.includes('pattern_match')) {
      return baseType;
    }
    return baseType;
  }

  private inferRelations(column: ColumnData, semanticType: string): string[] {
    const relations: string[] = [];

    if (semanticType === 'identifier') {
      relations.push('primary_key_candidate');
    }

    if (semanticType === 'email_address') {
      relations.push('user_identifier', 'contact_method');
    }

    if (semanticType === 'monetary_value') {
      relations.push('quantitative_measure');
    }

    if (semanticType === 'temporal') {
      relations.push('event_timestamp', 'temporal_dimension');
    }

    return relations;
  }

  private inferDomainTags(column: ColumnData, semanticType: string): string[] {
    const tags: string[] = [];
    const name = column.name.toLowerCase();

    if (/(cust|customer|user)/.test(name)) tags.push('customer_domain');
    if (/(order|purchase|transaction)/.test(name)) tags.push('transaction_domain');
    if (/(product|item|sku)/.test(name)) tags.push('product_domain');
    if (/(account|balance|payment)/.test(name)) tags.push('financial_domain');
    if (/(address|location|geo)/.test(name)) tags.push('geographic_domain');

    if (semanticType === 'email_address' || semanticType === 'phone_number') {
      tags.push('pii_sensitive');
    }

    return tags;
  }

  private buildSemanticContext(
    column: ColumnData,
    partial: Partial<SemanticContext>
  ): SemanticContext {
    const base = this.createBasicSemanticContext(column);
    return {
      ...base,
      ...partial,
      anchor_id: partial.anchor_id || base.anchor_id,
      semantic_type: partial.semantic_type || base.semantic_type,
      confidence: partial.confidence || base.confidence,
      metadata: { ...base.metadata, ...(partial.metadata || {}) },
      inferred_relations: partial.inferred_relations || base.inferred_relations,
      domain_specific_tags: partial.domain_specific_tags || base.domain_specific_tags
    };
  }

  private createBasicSemanticContext(column: ColumnData): SemanticContext {
    return {
      anchor_id: '',
      semantic_type: 'generic_attribute',
      confidence: 0.5,
      metadata: {
        data_type: column.data_type,
        cardinality: new Set(column.values).size,
        sample_size: column.values.length
      },
      inferred_relations: [],
      domain_specific_tags: []
    };
  }

  exportSemanticMappings(dataframeId?: string): Record<string, SemanticAttachment> {
    const result: Record<string, SemanticAttachment> = {};

    for (const [key, attachment] of this.semanticAttachments.entries()) {
      if (!dataframeId || key.startsWith(`${dataframeId}_`)) {
        const columnName = key.split('_').slice(1).join('_');
        result[columnName] = attachment;
      }
    }

    return result;
  }

  importSemanticMappings(
    mappings: Record<string, SemanticAttachment>,
    dataframeId: string
  ): void {
    for (const [columnName, attachment] of Object.entries(mappings)) {
      const key = `${dataframeId}_${columnName}`;
      this.semanticAttachments.set(key, {
        ...attachment,
        attachment_timestamp: new Date().toISOString()
      });
    }
  }
}