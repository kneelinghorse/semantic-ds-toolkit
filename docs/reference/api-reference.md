<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->
# API Reference (Auto-Generated)

Generated from `src/index.ts`. Run `npm run docs:api` to regenerate.

## Modules and Exports

This section is produced automatically by scanning the public exports in the package entrypoint.

<!-- AUTO-GENERATED:START -->
<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->
# API Reference (Auto-Generated)

Generated from `src/index.ts`. Run `npm run docs:api` to regenerate.

## Modules and Exports

### Module: ./core/anchors

Exports:
- `StableColumnAnchorSystem`

### Module: ./core/anchor-store

Exports:
- `AnchorStoreManager`

### Module: ./core/shadow-semantics

Exports:
- `ShadowSemanticsLayer`

Type Exports:
- `type DataFrameLike`
- `type SemanticAttachment`
- `type SemanticContext`
- `type ShadowSemanticOptions`

### Module: ./core/reconciler

Exports:
- `SmartAnchorReconciler`

Type Exports:
- `type AnchorDrift`
- `type ConfidenceMetrics`
- `type EnhancedReconciliationResult`
- `type ReconciliationStrategy`

### Module: ./core/attachment-api

Exports:
- `ShadowSemanticsAPI`
- `analyzeDataFrameCompatibility`
- `attachSemanticsShadow`
- `exportSemanticMappings`
- `getAllSemanticContexts`
- `getReconciliationStrategies`
- `getSemanticContext`
- `importSemanticMappings`
- `reconcileAnchors`
- `removeSemanticAttachment`
- `resetShadowAPI`
- `updateSemanticContext`

### Module: ./core/dataframe-adapters

Exports:
- `adaptDataFrame`
- `dataFrameRegistry`
- `getAdapterForType`
- `getSupportedDataFrameTypes`
- `registerAdapter`

Type Exports:
- `type DataFrameAdapter`

### Module: ./benchmarks/shadow-performance

Exports:
- `ShadowSystemBenchmark`
- `generateBenchmarkReport`
- `runShadowSystemBenchmark`

Type Exports:
- `type BenchmarkResult`
- `type BenchmarkSuite`

### Module: ./inference

Exports:
- `InferenceEngine`
- `PatternMatcher`
- `StatisticalAnalyzer`

Type Exports:
- `type Alternative`
- `type DataTypeInference`
- `type Evidence`
- `type InferenceOptions`
- `type InferenceResult`
- `type PatternDetector`
- `type PatternMatch`
- `type StatisticalMetrics`

### Module: ./normalizers

Exports:
- `AddressNormalizer`
- `EmailNormalizer`
- `NameNormalizer`
- `PhoneNormalizer`
- `SemanticNormalizer`
- `UuidNormalizer`
- `generateUuid`
- `isValidUuid`
- `normalizeAddress`
- `normalizeEmail`
- `normalizeName`
- `normalizePhone`
- `normalizeUuid`

Type Exports:
- `type AddressNormalizationOptions`
- `type EmailNormalizationOptions`
- `type NameNormalizationOptions`
- `type NormalizedAddress`
- `type NormalizedEmail`
- `type NormalizedName`
- `type NormalizedPhone`
- `type NormalizedUuid`
- `type NormalizerConfig`
- `type PhoneNormalizationOptions`
- `type UuidNormalizationOptions`

### Module: ./matchers

Exports:
- `FuzzyMatcher`
- `JaroWinklerMatcher`
- `LevenshteinMatcher`
- `PhoneticMatcher`
- `SimdOptimizedMatcher`
- `fuzzyDistance`
- `fuzzyMatch`
- `jaroSimilarity`
- `jaroWinklerDistance`
- `jaroWinklerSimilarity`
- `levenshteinDistance`
- `levenshteinSimilarity`
- `metaphone`
- `nysiis`
- `phoneticSimilarity`
- `simdMatcher`
- `soundex`

Type Exports:
- `type FuzzyMatchResult`
- `type FuzzyMatcherOptions`
- `type JaroWinklerOptions`
- `type JaroWinklerResult`
- `type LevenshteinOptions`
- `type LevenshteinResult`
- `type PhoneticOptions`
- `type PhoneticResult`
- `type SimdCapabilities`

### Module: ./drift

Exports:
- `AlertGenerator`
- `DriftDetector`
- `HistoricalComparisonEngine`
- `PatternDriftDetector`
- `PerformanceOptimizedDriftDetector`
- `StatisticalTests`

Type Exports:
- `type AlertContext`
- `type AnomalyAnalysis`
- `type BusinessImpactAssessment`
- `type DriftAlert`
- `type DriftDetails`
- `type DriftDetectionConfig`
- `type DriftDetectionResult`
- `type DriftType`
- `type HistoricalComparison`
- `type HistoricalDataPoint`
- `type MonitoringRecommendations`
- `type RemediationPlan`
- `type StabilityMetrics`
- `type TrendAnalysis`

### Module: ./types/anchor.types

Type Exports:
- `type AnchorMatchScore`
- `type AnchorReconciliationResult`
- `type AnchorStore`
- `type ColumnData`
- `type ColumnFingerprint`
- `type ColumnStatistics`
- `type DataType`
- `type Dataset`
- `type FingerprintConfig`
- `type ReconciliationOptions`
- `type StableColumnAnchor`

<!-- AUTO-GENERATED:END -->

