// Main drift detection exports
export {
  DriftDetector,
  type DriftDetectionConfig,
  type DriftDetectionResult,
  type DriftType,
  type DriftDetails
} from './drift-detector';

// Statistical tests exports
export {
  StatisticalTests,
  type KolmogorovSmirnovResult,
  type PopulationStabilityResult,
  type ChiSquareResult
} from './statistical-tests';

// Pattern drift detection exports
export {
  PatternDriftDetector,
  type PatternDriftAnalysis,
  type PatternInfo,
  type PatternChange,
  type SampleDriftAnalysis,
  type StructuralChange
} from './pattern-drift';

// Alert generation exports
export {
  AlertGenerator,
  type DriftAlert,
  type AlertContext,
  type RemediationPlan,
  type Action,
  type MonitoringRecommendations,
  type BusinessImpactAssessment,
  type TechnicalDetails
} from './alert-generator';

// Historical comparison exports
export {
  HistoricalComparisonEngine,
  type HistoricalDataPoint,
  type HistoricalComparison,
  type TimeWindow,
  type DriftEvolution,
  type StabilityMetrics,
  type TrendAnalysis,
  type AnomalyAnalysis,
  type SeasonalityAnalysis,
  type HistoricalRecommendations
} from './historical-comparison';

// Performance-optimized drift detection exports
export {
  PerformanceOptimizedDriftDetector,
  type PerformanceMetrics
} from './performance-optimizer';