export { StableColumnAnchorSystem } from './core/anchors';
export { AnchorStoreManager } from './core/anchor-store';

export {
  ShadowSemanticsLayer,
  type DataFrameLike,
  type SemanticContext,
  type SemanticAttachment,
  type ShadowSemanticOptions
} from './core/shadow-semantics';

export {
  SmartAnchorReconciler,
  type ConfidenceMetrics,
  type ReconciliationStrategy,
  type EnhancedReconciliationResult,
  type AnchorDrift
} from './core/reconciler';

export {
  attachSemanticsShadow,
  reconcileAnchors,
  getSemanticContext,
  getAllSemanticContexts,
  updateSemanticContext,
  removeSemanticAttachment,
  exportSemanticMappings,
  importSemanticMappings,
  analyzeDataFrameCompatibility,
  getReconciliationStrategies,
  resetShadowAPI,
  ShadowSemanticsAPI
} from './core/attachment-api';

export {
  adaptDataFrame,
  registerAdapter,
  getSupportedDataFrameTypes,
  getAdapterForType,
  dataFrameRegistry,
  type DataFrameAdapter
} from './core/dataframe-adapters';

export {
  runShadowSystemBenchmark,
  generateBenchmarkReport,
  ShadowSystemBenchmark,
  type BenchmarkResult,
  type BenchmarkSuite
} from './benchmarks/shadow-performance';

export {
  InferenceEngine,
  PatternMatcher,
  StatisticalAnalyzer,
  type InferenceResult,
  type Evidence,
  type Alternative,
  type InferenceOptions,
  type PatternMatch,
  type PatternDetector,
  type StatisticalMetrics,
  type DataTypeInference
} from './inference';

export {
  SemanticNormalizer,
  EmailNormalizer,
  PhoneNormalizer,
  NameNormalizer,
  AddressNormalizer,
  UuidNormalizer,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeAddress,
  normalizeUuid,
  isValidUuid,
  generateUuid,
  type EmailNormalizationOptions,
  type PhoneNormalizationOptions,
  type NameNormalizationOptions,
  type AddressNormalizationOptions,
  type UuidNormalizationOptions,
  type NormalizedEmail,
  type NormalizedPhone,
  type NormalizedName,
  type NormalizedAddress,
  type NormalizedUuid,
  type NormalizerConfig
} from './normalizers';

export {
  FuzzyMatcher,
  JaroWinklerMatcher,
  LevenshteinMatcher,
  PhoneticMatcher,
  SimdOptimizedMatcher,
  simdMatcher,
  fuzzyMatch,
  fuzzyDistance,
  jaroWinklerSimilarity,
  jaroWinklerDistance,
  jaroSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  soundex,
  metaphone,
  nysiis,
  phoneticSimilarity,
  type FuzzyMatcherOptions,
  type FuzzyMatchResult,
  type JaroWinklerOptions,
  type JaroWinklerResult,
  type LevenshteinOptions,
  type LevenshteinResult,
  type PhoneticOptions,
  type PhoneticResult,
  type SimdCapabilities
} from './matchers';

export {
  DriftDetector,
  PerformanceOptimizedDriftDetector,
  StatisticalTests,
  PatternDriftDetector,
  AlertGenerator,
  HistoricalComparisonEngine,
  type DriftDetectionConfig,
  type DriftDetectionResult,
  type DriftType,
  type DriftDetails,
  type DriftAlert,
  type AlertContext,
  type RemediationPlan,
  type MonitoringRecommendations,
  type BusinessImpactAssessment,
  type HistoricalDataPoint,
  type HistoricalComparison,
  type StabilityMetrics,
  type TrendAnalysis,
  type AnomalyAnalysis
} from './drift';

export type {
  StableColumnAnchor,
  ColumnFingerprint,
  ColumnStatistics,
  AnchorReconciliationResult,
  AnchorMatchScore,
  FingerprintConfig,
  ReconciliationOptions,
  AnchorStore,
  DataType,
  ColumnData,
  Dataset
} from './types/anchor.types';