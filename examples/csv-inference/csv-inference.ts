import {
  StableColumnAnchorSystem,
  AnchorStoreManager,
  InferenceEngine,
  PatternMatcher,
  StatisticalAnalyzer
} from '@semantic-toolkit/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parser';

export interface CSVInferenceOptions {
  confidenceThreshold?: number;
  handleMissingValues?: boolean;
  normalizeHeaders?: boolean;
  maxSampleSize?: number;
  customPatterns?: { [key: string]: RegExp };
}

export interface InferenceResult {
  columnName: string;
  inferredCID: string;
  confidence: number;
  dataType: string;
  patterns: string[];
  statistics: {
    nullCount: number;
    uniqueCount: number;
    totalCount: number;
    nullRatio: number;
    uniqueRatio: number;
  };
  anchor?: any;
}

export interface CSVInferenceReport {
  filePath: string;
  rowCount: number;
  columnCount: number;
  inferenceResults: InferenceResult[];
  anchors: any[];
  processingTime: number;
  qualityScore: number;
}

export class CSVInferenceEngine {
  private anchorSystem: StableColumnAnchorSystem;
  private inferenceEngine: InferenceEngine;
  private patternMatcher: PatternMatcher;
  private statisticalAnalyzer: StatisticalAnalyzer;
  private store: AnchorStoreManager;

  constructor(private options: CSVInferenceOptions = {}) {
    this.anchorSystem = new StableColumnAnchorSystem();
    this.inferenceEngine = new InferenceEngine();
    this.patternMatcher = new PatternMatcher({
      ...this.getDefaultPatterns(),
      ...options.customPatterns
    });
    this.statisticalAnalyzer = new StatisticalAnalyzer();
    this.store = new AnchorStoreManager('./semantics');
  }

  async inferFromFile(csvPath: string): Promise<CSVInferenceReport> {
    const startTime = Date.now();

    console.log(`🔍 Analyzing ${path.basename(csvPath)}...`);

    // Parse CSV file
    const data = await this.parseCSV(csvPath);

    if (data.length === 0) {
      throw new Error('CSV file is empty or could not be parsed');
    }

    // Perform inference
    const results = await this.performInference(data, csvPath);

    const processingTime = Date.now() - startTime;

    const report: CSVInferenceReport = {
      filePath: csvPath,
      rowCount: data.length,
      columnCount: Object.keys(data[0]).length,
      inferenceResults: results,
      anchors: results.map(r => r.anchor).filter(Boolean),
      processingTime,
      qualityScore: this.calculateQualityScore(results)
    };

    // Save results
    await this.saveResults(report);

    console.log('✅ Semantic inference complete:');
    results.forEach(result => {
      const icon = this.getColumnIcon(result.inferredCID);
      console.log(`  ${icon} Column '${result.columnName}' → ${result.inferredCID} (confidence: ${result.confidence.toFixed(2)})`);
    });

    console.log(`\n💾 Saved ${report.anchors.length} semantic anchors to ./semantics/`);

    return report;
  }

  async inferFromString(csvString: string): Promise<CSVInferenceReport> {
    // Write to temporary file and process
    const tempPath = './temp-inference.csv';
    fs.writeFileSync(tempPath, csvString);

    try {
      const result = await this.inferFromFile(tempPath);
      result.filePath = 'string-input';
      return result;
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  private async parseCSV(csvPath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];

      fs.createReadStream(csvPath)
        .pipe(parse({
          headers: true,
          skipEmptyLines: true,
          maxRows: this.options.maxSampleSize || 10000
        }))
        .on('data', (data) => {
          // Normalize headers if requested
          if (this.options.normalizeHeaders) {
            const normalizedData: any = {};
            Object.keys(data).forEach(key => {
              const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
              normalizedData[normalizedKey] = data[key];
            });
            results.push(normalizedData);
          } else {
            results.push(data);
          }
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  private async performInference(data: any[], filePath: string): Promise<InferenceResult[]> {
    const columns = Object.keys(data[0]);
    const results: InferenceResult[] = [];

    for (const columnName of columns) {
      const columnData = data.map(row => row[columnName]);

      // Clean and prepare data
      const cleanedData = this.cleanColumnData(columnData);

      // Calculate statistics
      const statistics = this.statisticalAnalyzer.analyze(cleanedData);

      // Detect patterns
      const patterns = this.patternMatcher.detectPatterns(cleanedData);

      // Infer semantic meaning
      const inference = await this.inferenceEngine.inferSemanticType(
        cleanedData,
        patterns,
        statistics
      );

      // Create anchor if confidence is high enough
      let anchor = null;
      if (inference.confidence >= (this.options.confidenceThreshold || 0.7)) {
        anchor = this.anchorSystem.createAnchor(
          filePath,
          cleanedData,
          inference.cid,
          inference.confidence
        );

        // Save anchor
        await this.store.saveAnchor(anchor);
      }

      const result: InferenceResult = {
        columnName,
        inferredCID: inference.cid,
        confidence: inference.confidence,
        dataType: statistics.dataType,
        patterns: patterns.map(p => p.name),
        statistics: {
          nullCount: statistics.nullCount,
          uniqueCount: statistics.uniqueCount,
          totalCount: cleanedData.length,
          nullRatio: statistics.nullRatio,
          uniqueRatio: statistics.uniqueRatio
        },
        anchor
      };

      results.push(result);
    }

    return results;
  }

  private cleanColumnData(columnData: any[]): any[] {
    if (!this.options.handleMissingValues) {
      return columnData;
    }

    return columnData.map(value => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      // Trim strings
      if (typeof value === 'string') {
        return value.trim();
      }

      return value;
    });
  }

  private calculateQualityScore(results: InferenceResult[]): number {
    if (results.length === 0) return 0;

    // Quality factors:
    // - High confidence inferences
    // - Low null ratios
    // - Good pattern recognition
    // - Reasonable uniqueness ratios

    let totalScore = 0;

    results.forEach(result => {
      let score = 0;

      // Confidence score (0-40 points)
      score += result.confidence * 40;

      // Data completeness (0-20 points)
      score += Math.max(0, (1 - result.statistics.nullRatio) * 20);

      // Pattern recognition (0-20 points)
      score += Math.min(20, result.patterns.length * 5);

      // Uniqueness appropriateness (0-20 points)
      if (result.inferredCID.includes('id') || result.inferredCID.includes('key')) {
        // IDs should have high uniqueness
        score += result.statistics.uniqueRatio > 0.8 ? 20 : result.statistics.uniqueRatio * 20;
      } else if (result.inferredCID.includes('category') || result.inferredCID.includes('type')) {
        // Categories should have lower uniqueness
        score += result.statistics.uniqueRatio < 0.3 ? 20 : (1 - result.statistics.uniqueRatio) * 20;
      } else {
        // Moderate uniqueness is generally good
        const idealUniqueness = 0.5;
        const deviation = Math.abs(result.statistics.uniqueRatio - idealUniqueness);
        score += Math.max(0, 20 - (deviation * 40));
      }

      totalScore += Math.min(100, score);
    });

    return Math.round(totalScore / results.length);
  }

  private async saveResults(report: CSVInferenceReport): Promise<void> {
    // Ensure output directory exists
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save detailed report
    const reportPath = path.join(outputDir, 'inference-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Save confidence scores CSV
    const csvPath = path.join(outputDir, 'confidence-scores.csv');
    const csvHeader = 'column_name,inferred_cid,confidence,data_type,null_ratio,unique_ratio\n';
    const csvRows = report.inferenceResults.map(r =>
      `${r.columnName},${r.inferredCID},${r.confidence},${r.dataType},${r.statistics.nullRatio},${r.statistics.uniqueRatio}`
    ).join('\n');
    fs.writeFileSync(csvPath, csvHeader + csvRows);

    // Save summary report
    const summaryPath = path.join(outputDir, 'summary-report.md');
    const summary = this.generateMarkdownSummary(report);
    fs.writeFileSync(summaryPath, summary);
  }

  private generateMarkdownSummary(report: CSVInferenceReport): string {
    return `# Semantic Inference Report

## File Analysis
- **File**: ${path.basename(report.filePath)}
- **Rows**: ${report.rowCount.toLocaleString()}
- **Columns**: ${report.columnCount}
- **Processing Time**: ${report.processingTime}ms
- **Quality Score**: ${report.qualityScore}/100

## Column Analysis

| Column | Semantic Type | Confidence | Data Type | Completeness | Uniqueness |
|--------|---------------|-----------|-----------|--------------|------------|
${report.inferenceResults.map(r =>
  `| ${r.columnName} | ${r.inferredCID} | ${(r.confidence * 100).toFixed(1)}% | ${r.dataType} | ${((1 - r.statistics.nullRatio) * 100).toFixed(1)}% | ${(r.statistics.uniqueRatio * 100).toFixed(1)}% |`
).join('\n')}

## Quality Assessment

### High Confidence Columns (≥80%)
${report.inferenceResults.filter(r => r.confidence >= 0.8).map(r =>
  `- **${r.columnName}**: ${r.inferredCID} (${(r.confidence * 100).toFixed(1)}%)`
).join('\n') || 'None'}

### Low Confidence Columns (<70%)
${report.inferenceResults.filter(r => r.confidence < 0.7).map(r =>
  `- **${r.columnName}**: ${r.inferredCID} (${(r.confidence * 100).toFixed(1)}%) - May need manual review`
).join('\n') || 'None'}

### Data Quality Issues
${report.inferenceResults.filter(r => r.statistics.nullRatio > 0.1).map(r =>
  `- **${r.columnName}**: ${(r.statistics.nullRatio * 100).toFixed(1)}% missing values`
).join('\n') || 'No significant missing data detected'}

## Recommendations

${this.generateRecommendations(report)}

---
*Generated by Semantic Data Science Toolkit*
`;
  }

  private generateRecommendations(report: CSVInferenceReport): string {
    const recommendations: string[] = [];

    // Low confidence recommendations
    const lowConfidence = report.inferenceResults.filter(r => r.confidence < 0.7);
    if (lowConfidence.length > 0) {
      recommendations.push('**Low Confidence Columns**: Consider manual review or additional pattern definitions');
    }

    // Missing data recommendations
    const highMissing = report.inferenceResults.filter(r => r.statistics.nullRatio > 0.2);
    if (highMissing.length > 0) {
      recommendations.push('**High Missing Data**: Investigate data collection processes');
    }

    // Uniqueness recommendations
    const potentialIds = report.inferenceResults.filter(r =>
      r.statistics.uniqueRatio > 0.95 && !r.inferredCID.includes('id')
    );
    if (potentialIds.length > 0) {
      recommendations.push('**Potential IDs**: Consider if these columns should be classified as identifiers');
    }

    // Performance recommendations
    if (report.rowCount > 100000) {
      recommendations.push('**Large Dataset**: Consider sampling for faster processing in production');
    }

    return recommendations.length > 0 ? recommendations.join('\n\n') : 'No specific recommendations - data quality looks good!';
  }

  private getDefaultPatterns(): { [key: string]: RegExp } {
    return {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\+]?[1-9][\d\s\-\(\)\.]{7,15}$/,
      ssn: /^\d{3}-\d{2}-\d{4}$/,
      zipcode: /^\d{5}(-\d{4})?$/,
      date_iso: /^\d{4}-\d{2}-\d{2}$/,
      date_us: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
      time: /^\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM))?$/i,
      url: /^https?:\/\/[^\s]+$/,
      ipv4: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      currency: /^\$?[\d,]+\.?\d{0,2}$/,
      percentage: /^\d+\.?\d*%$/,
      credit_card: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/
    };
  }

  private getColumnIcon(cid: string): string {
    if (cid.includes('email')) return '📧';
    if (cid.includes('name')) return '👤';
    if (cid.includes('phone')) return '📱';
    if (cid.includes('age') || cid.includes('birth')) return '🎂';
    if (cid.includes('location') || cid.includes('city') || cid.includes('address')) return '🏙️';
    if (cid.includes('date') || cid.includes('time')) return '📅';
    if (cid.includes('amount') || cid.includes('price') || cid.includes('currency')) return '💰';
    if (cid.includes('id') || cid.includes('key')) return '🔑';
    if (cid.includes('url') || cid.includes('link')) return '🔗';
    if (cid.includes('category') || cid.includes('type')) return '🏷️';
    return '📊';
  }
}

// Main function for easy usage
export async function runCSVInference(csvPath: string, options?: CSVInferenceOptions): Promise<CSVInferenceReport> {
  const engine = new CSVInferenceEngine(options);
  return engine.inferFromFile(csvPath);
}

// Export for demo script
export { CSVInferenceEngine };