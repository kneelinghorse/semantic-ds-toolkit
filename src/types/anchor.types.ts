export interface StableColumnAnchor {
  dataset: string;
  column_name: string;
  anchor_id: string;
  fingerprint: string;
  first_seen: string;
  last_seen: string;
  mapped_cid?: string;
  confidence?: number;
}

export interface ColumnFingerprint {
  min?: string | number;
  max?: string | number;
  dtype: string;
  cardinality: number;
  regex_patterns: string[];
  null_ratio: number;
  unique_ratio: number;
  sample_values: string[];
}

export interface AnchorReconciliationResult {
  matched_anchors: Array<{
    anchor_id: string;
    column_name: string;
    confidence: number;
    match_reason: string[];
  }>;
  unmatched_columns: string[];
  new_anchors: StableColumnAnchor[];
}

export interface FingerprintConfig {
  sample_size: number;
  regex_patterns: string[];
  min_cardinality_threshold: number;
  max_unique_ratio: number;
}

export interface ColumnStatistics {
  total_rows: number;
  null_count: number;
  unique_count: number;
  min_value?: string | number;
  max_value?: string | number;
  data_type: string;
  sample_values: string[];
}

export interface AnchorMatchScore {
  anchor_id: string;
  total_score: number;
  component_scores: {
    dtype_match: number;
    cardinality_similarity: number;
    regex_match: number;
    statistical_similarity: number;
    name_similarity: number;
  };
  confidence: number;
}

export interface AnchorStore {
  anchors: Map<string, StableColumnAnchor>;
  dataset_index: Map<string, string[]>;
  last_updated: string;
}

export interface ReconciliationOptions {
  confidence_threshold: number;
  allow_multiple_matches: boolean;
  create_new_anchors: boolean;
  drift_tolerance: number;
}

export type DataType = 'string' | 'int64' | 'float64' | 'boolean' | 'datetime' | 'unknown';

export interface ColumnData {
  name: string;
  values: any[];
  data_type: DataType;
}

export interface Dataset {
  path: string;
  columns: ColumnData[];
  metadata?: Record<string, any>;
}