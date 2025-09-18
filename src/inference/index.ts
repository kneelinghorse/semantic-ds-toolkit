export { PatternMatcher, PatternMatch, PatternDetector } from './pattern-matcher';
export {
  StatisticalAnalyzer,
  StatisticalMetrics,
  NumericStats,
  StringStats,
  TemporalStats,
  DataTypeInference
} from './statistical-analyzer';
export {
  InferenceEngine,
  InferenceResult,
  Evidence,
  Alternative,
  InferenceOptions
} from './inference-engine';

// Re-export main inference function for convenience
export { InferenceEngine as default } from './inference-engine';
