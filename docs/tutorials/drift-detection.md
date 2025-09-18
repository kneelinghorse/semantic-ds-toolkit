# Tutorial: Setting Up Continuous Drift Detection

*Learning objective: Build automated drift detection to catch schema and data changes early*

## What You'll Build

- Automated drift detection pipeline
- Statistical tests for data quality changes
- Alert system for schema drift
- Historical comparison dashboard
- Performance-optimized monitoring

## Why Drift Detection Matters

Data drift silently breaks data pipelines:
- **Schema drift**: New columns, type changes, renamed fields
- **Statistical drift**: Distribution changes, outliers, missing values
- **Semantic drift**: Meaning changes (e.g., currency conversion)
- **Quality drift**: Increasing nulls, format violations

Early detection saves hours of debugging and prevents broken dashboards.

## Prerequisites

- Complete [Your First Semantic Mapping](your-first-semantic-mapping.md)
- Understanding of statistical concepts (mean, variance, distributions)

## Step 1: Understanding Drift Types

Let's simulate different types of drift:

```typescript
import { DriftDetector, StatisticalTests } from '@semantic-toolkit/anchor';

// Create sample baseline data
const baselineData = {
  age: Array.from({ length: 1000 }, () => 25 + Math.random() * 40), // 25-65
  salary: Array.from({ length: 1000 }, () => 50000 + Math.random() * 100000), // 50k-150k
  city: Array.from({ length: 1000 }, () => ['NYC', 'LA', 'Chicago', 'Houston'][Math.floor(Math.random() * 4)])
};

// Simulate different drift scenarios
const driftScenarios = {
  // Scenario 1: Statistical drift (age distribution shifted)
  ageDrift: Array.from({ length: 1000 }, () => 35 + Math.random() * 30), // 35-65 (older)

  // Scenario 2: Quality drift (more nulls)
  salaryWithNulls: Array.from({ length: 1000 }, (_, i) =>
    i < 200 ? null : 50000 + Math.random() * 100000),

  // Scenario 3: Semantic drift (new city categories)
  expandedCities: Array.from({ length: 1000 }, () =>
    ['NYC', 'LA', 'Chicago', 'Houston', 'Seattle', 'Austin', 'Miami'][Math.floor(Math.random() * 7)])
};

async function demonstrateDriftTypes() {
  const detector = new DriftDetector();

  console.log('🔍 Drift Detection Examples\n');

  // Test statistical drift
  const ageDriftResult = detector.detectStatisticalDrift(
    baselineData.age,
    driftScenarios.ageDrift
  );

  console.log('📊 Age Distribution Drift:');
  console.log(`  Baseline mean: ${ageDriftResult.baseline.mean.toFixed(1)}`);
  console.log(`  Current mean: ${ageDriftResult.current.mean.toFixed(1)}`);
  console.log(`  P-value: ${ageDriftResult.pValue.toFixed(4)}`);
  console.log(`  Drift detected: ${ageDriftResult.isDrift ? '⚠️ YES' : '✅ NO'}`);
  console.log('');

  // Test quality drift
  const qualityDriftResult = detector.detectQualityDrift(
    baselineData.salary,
    driftScenarios.salaryWithNulls
  );

  console.log('💰 Salary Quality Drift:');
  console.log(`  Baseline null rate: ${(qualityDriftResult.baseline.nullRate * 100).toFixed(1)}%`);
  console.log(`  Current null rate: ${(qualityDriftResult.current.nullRate * 100).toFixed(1)}%`);
  console.log(`  Quality drift: ${qualityDriftResult.isDrift ? '⚠️ YES' : '✅ NO'}`);
  console.log('');

  // Test categorical drift
  const categoricalDriftResult = detector.detectCategoricalDrift(
    baselineData.city,
    driftScenarios.expandedCities
  );

  console.log('🏙️ City Category Drift:');
  console.log(`  Baseline categories: ${categoricalDriftResult.baseline.uniqueCount}`);
  console.log(`  Current categories: ${categoricalDriftResult.current.uniqueCount}`);
  console.log(`  New categories: ${categoricalDriftResult.newCategories.join(', ')}`);
  console.log(`  Category drift: ${categoricalDriftResult.isDrift ? '⚠️ YES' : '✅ NO'}`);
}
```

## Step 2: Building a Drift Monitoring Pipeline

Create a comprehensive monitoring system:

```typescript
import {
  DriftDetector,
  AnchorStoreManager,
  AlertGenerator,
  HistoricalComparison
} from '@semantic-toolkit/anchor';
import * as fs from 'fs';

class DriftMonitor {
  private detector: DriftDetector;
  private store: AnchorStoreManager;
  private alerter: AlertGenerator;
  private history: HistoricalComparison;

  constructor() {
    this.detector = new DriftDetector({
      statistical_threshold: 0.05,  // p-value threshold
      quality_threshold: 0.1,       // 10% change in quality metrics
      categorical_threshold: 0.05   // 5% new categories
    });

    this.store = new AnchorStoreManager('./semantics');
    this.alerter = new AlertGenerator();
    this.history = new HistoricalComparison('./drift-history');
  }

  async monitorDataset(datasetPath: string, currentData: any) {
    console.log(`🔍 Monitoring drift for ${datasetPath}...`);

    // Get baseline anchors
    const baselineAnchors = await this.store.getAnchorsForDataset(datasetPath);

    if (baselineAnchors.length === 0) {
      console.log('📝 No baseline found. Creating initial anchors...');
      return this.createBaseline(datasetPath, currentData);
    }

    const driftResults = [];

    // Check each column for drift
    for (const [columnName, columnData] of Object.entries(currentData)) {
      const anchor = baselineAnchors.find(a => a.column_name === columnName);

      if (!anchor) {
        console.log(`⚠️ New column detected: ${columnName}`);
        driftResults.push({
          column: columnName,
          type: 'schema',
          severity: 'medium',
          message: 'New column added'
        });
        continue;
      }

      // Get historical data for comparison
      const historicalData = await this.history.getColumnHistory(datasetPath, columnName);

      if (!historicalData) {
        console.log(`📊 No history for ${columnName}, creating baseline...`);
        await this.history.recordColumnData(datasetPath, columnName, columnData);
        continue;
      }

      // Detect drift
      const driftResult = await this.detectColumnDrift(
        columnName,
        historicalData.data,
        columnData,
        anchor
      );

      if (driftResult.isDrift) {
        driftResults.push(driftResult);
      }

      // Record current data for future comparisons
      await this.history.recordColumnData(datasetPath, columnName, columnData);
    }

    // Generate alerts if drift detected
    if (driftResults.length > 0) {
      await this.generateAlerts(datasetPath, driftResults);
    }

    return {
      dataset: datasetPath,
      driftCount: driftResults.length,
      drifts: driftResults,
      timestamp: new Date()
    };
  }

  private async detectColumnDrift(columnName: string, historicalData: any[], currentData: any[], anchor: any) {
    const result = {
      column: columnName,
      isDrift: false,
      type: '',
      severity: 'low',
      message: '',
      details: {}
    };

    // Determine data type and appropriate tests
    const dataType = this.inferDataType(currentData);

    switch (dataType) {
      case 'numeric':
        const statResult = this.detector.detectStatisticalDrift(historicalData, currentData);
        if (statResult.isDrift) {
          result.isDrift = true;
          result.type = 'statistical';
          result.severity = statResult.pValue < 0.01 ? 'high' : 'medium';
          result.message = `Statistical distribution changed (p=${statResult.pValue.toFixed(4)})`;
          result.details = statResult;
        }
        break;

      case 'categorical':
        const catResult = this.detector.detectCategoricalDrift(historicalData, currentData);
        if (catResult.isDrift) {
          result.isDrift = true;
          result.type = 'categorical';
          result.severity = catResult.newCategories.length > 5 ? 'high' : 'medium';
          result.message = `New categories: ${catResult.newCategories.join(', ')}`;
          result.details = catResult;
        }
        break;

      case 'string':
        const patternResult = this.detector.detectPatternDrift(historicalData, currentData);
        if (patternResult.isDrift) {
          result.isDrift = true;
          result.type = 'pattern';
          result.severity = 'medium';
          result.message = `Data pattern changed`;
          result.details = patternResult;
        }
        break;
    }

    // Always check quality drift
    const qualityResult = this.detector.detectQualityDrift(historicalData, currentData);
    if (qualityResult.isDrift) {
      result.isDrift = true;
      result.type = result.type ? `${result.type}+quality` : 'quality';
      result.severity = 'high'; // Quality issues are always high priority
      result.message += ` Quality degraded: ${qualityResult.issues.join(', ')}`;
      result.details.quality = qualityResult;
    }

    return result;
  }

  private inferDataType(data: any[]): 'numeric' | 'categorical' | 'string' {
    const sample = data.filter(x => x != null).slice(0, 100);

    if (sample.every(x => typeof x === 'number' && !isNaN(x))) {
      return 'numeric';
    }

    const uniqueValues = new Set(sample).size;
    if (uniqueValues < sample.length * 0.1) { // Less than 10% unique values
      return 'categorical';
    }

    return 'string';
  }

  private async generateAlerts(datasetPath: string, drifts: any[]) {
    const highSeverityDrifts = drifts.filter(d => d.severity === 'high');

    if (highSeverityDrifts.length > 0) {
      await this.alerter.sendAlert({
        level: 'error',
        dataset: datasetPath,
        message: `High-severity drift detected in ${highSeverityDrifts.length} columns`,
        details: highSeverityDrifts
      });
    }

    const mediumSeverityDrifts = drifts.filter(d => d.severity === 'medium');

    if (mediumSeverityDrifts.length > 0) {
      await this.alerter.sendAlert({
        level: 'warning',
        dataset: datasetPath,
        message: `Medium-severity drift detected in ${mediumSeverityDrifts.length} columns`,
        details: mediumSeverityDrifts
      });
    }
  }

  private async createBaseline(datasetPath: string, data: any) {
    // Create initial anchors for baseline
    const anchors = new StableColumnAnchorSystem();

    for (const [columnName, columnData] of Object.entries(data)) {
      const anchor = anchors.createAnchor(datasetPath, columnData, `${datasetPath}.${columnName}`);
      await this.store.saveAnchor(anchor);
      await this.history.recordColumnData(datasetPath, columnName, columnData);
    }

    console.log(`✅ Created baseline for ${Object.keys(data).length} columns`);
  }
}
```

## Step 3: Automated Monitoring with Scheduling

Set up automated monitoring:

```typescript
import { PerformanceOptimizer } from '@semantic-toolkit/anchor';

class ScheduledDriftMonitor {
  private monitor: DriftMonitor;
  private optimizer: PerformanceOptimizer;
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.monitor = new DriftMonitor();
    this.optimizer = new PerformanceOptimizer();
  }

  scheduleMonitoring(datasetPath: string, dataLoader: () => Promise<any>, intervalMinutes: number = 60) {
    console.log(`⏰ Scheduling monitoring for ${datasetPath} every ${intervalMinutes} minutes`);

    const interval = setInterval(async () => {
      try {
        console.log(`\n🔄 Running scheduled drift check for ${datasetPath}...`);

        // Load current data
        const startTime = Date.now();
        const currentData = await dataLoader();

        // Run drift detection
        const result = await this.monitor.monitorDataset(datasetPath, currentData);

        const duration = Date.now() - startTime;
        console.log(`✅ Drift check completed in ${duration}ms`);

        if (result.driftCount > 0) {
          console.log(`⚠️ ${result.driftCount} drift(s) detected!`);
          result.drifts.forEach(drift => {
            console.log(`  ${drift.column}: ${drift.message} [${drift.severity}]`);
          });
        } else {
          console.log(`✅ No drift detected`);
        }

        // Optimize performance based on dataset size
        await this.optimizer.adjustMonitoringFrequency(datasetPath, {
          dataSize: Object.values(currentData)[0]?.length || 0,
          driftHistory: result.driftCount,
          processingTime: duration
        });

      } catch (error) {
        console.error(`❌ Drift monitoring failed for ${datasetPath}:`, error);
      }
    }, intervalMinutes * 60 * 1000);

    this.intervals.set(datasetPath, interval);
  }

  stopMonitoring(datasetPath: string) {
    const interval = this.intervals.get(datasetPath);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(datasetPath);
      console.log(`⏹️ Stopped monitoring ${datasetPath}`);
    }
  }

  stopAllMonitoring() {
    this.intervals.forEach((interval, datasetPath) => {
      clearInterval(interval);
      console.log(`⏹️ Stopped monitoring ${datasetPath}`);
    });
    this.intervals.clear();
  }
}
```

## Step 4: Building a Drift Dashboard

Create a monitoring dashboard:

```typescript
class DriftDashboard {
  private history: HistoricalComparison;

  constructor() {
    this.history = new HistoricalComparison('./drift-history');
  }

  async generateDashboard(): Promise<string> {
    const datasets = await this.history.getAllDatasets();

    let dashboard = `
# Drift Detection Dashboard
Generated: ${new Date().toISOString()}

## Summary
`;

    let totalDrifts = 0;
    let activeDrifts = 0;

    for (const dataset of datasets) {
      const driftSummary = await this.history.getDriftSummary(dataset, 24); // Last 24 hours
      totalDrifts += driftSummary.totalDrifts;
      activeDrifts += driftSummary.activeDrifts;

      dashboard += `
### ${dataset}
- **Status**: ${driftSummary.activeDrifts > 0 ? '⚠️ DRIFT DETECTED' : '✅ STABLE'}
- **Active Drifts**: ${driftSummary.activeDrifts}
- **Total Drifts (24h)**: ${driftSummary.totalDrifts}
- **Last Check**: ${driftSummary.lastCheck}

#### Column Status:
`;

      for (const column of driftSummary.columns) {
        const status = column.isDrifting ? '⚠️' : '✅';
        dashboard += `- ${status} **${column.name}**: ${column.status}\n`;
      }
    }

    dashboard += `
## Overall Status
- **Total Datasets**: ${datasets.length}
- **Datasets with Drift**: ${datasets.filter(async d => (await this.history.getDriftSummary(d, 24)).activeDrifts > 0).length}
- **Total Active Drifts**: ${activeDrifts}
- **Drifts (24h)**: ${totalDrifts}

## Quick Actions
- [View Detailed Report](./drift-details.html)
- [Configure Alerts](./alert-config.html)
- [Export Data](./export-drift-data.csv)
`;

    return dashboard;
  }

  async saveDashboard() {
    const dashboard = await this.generateDashboard();
    fs.writeFileSync('./drift-dashboard.md', dashboard);
    console.log('📊 Dashboard saved to drift-dashboard.md');
  }
}
```

## Step 5: Complete Monitoring Setup

Put everything together:

```typescript
async function setupDriftMonitoring() {
  console.log('🚀 Setting up Drift Monitoring System\n');

  const scheduledMonitor = new ScheduledDriftMonitor();
  const dashboard = new DriftDashboard();

  // Example data loaders for different datasets
  const customerDataLoader = async () => {
    // In practice, this would load from your data source
    return {
      email: ['john@example.com', 'jane@example.com'],
      age: [25, 30],
      city: ['NYC', 'LA']
    };
  };

  const orderDataLoader = async () => {
    return {
      order_id: [1001, 1002],
      amount: [99.99, 149.50],
      date: ['2024-01-15', '2024-01-16']
    };
  };

  // Schedule monitoring for different datasets
  scheduledMonitor.scheduleMonitoring('customers', customerDataLoader, 30); // Every 30 minutes
  scheduledMonitor.scheduleMonitoring('orders', orderDataLoader, 15);       // Every 15 minutes

  // Generate dashboard every hour
  setInterval(async () => {
    await dashboard.saveDashboard();
  }, 60 * 60 * 1000);

  console.log('✅ Drift monitoring system is running!');
  console.log('📊 Dashboard will be generated every hour');
  console.log('⏰ Monitoring schedules:');
  console.log('  - customers: every 30 minutes');
  console.log('  - orders: every 15 minutes');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down drift monitoring...');
    scheduledMonitor.stopAllMonitoring();
    process.exit(0);
  });

  // Initial dashboard generation
  await dashboard.saveDashboard();
}

// Run the monitoring system
setupDriftMonitoring().catch(console.error);
```

## Performance Optimization

For large datasets:

```typescript
import { BatchProcessor, CacheManager } from '@semantic-toolkit/anchor';

class OptimizedDriftDetector extends DriftDetector {
  private batchProcessor: BatchProcessor;
  private cache: CacheManager;

  constructor() {
    super();
    this.batchProcessor = new BatchProcessor({ batchSize: 5000, maxConcurrency: 4 });
    this.cache = new CacheManager({ maxSize: 1000, ttl: 3600000 }); // 1 hour TTL
  }

  async detectStatisticalDriftBatched(baseline: any[], current: any[]): Promise<any> {
    // Use sampling for very large datasets
    if (current.length > 10000) {
      const sampleSize = Math.min(1000, Math.floor(current.length * 0.1));
      const sampledCurrent = this.sampleData(current, sampleSize);
      const sampledBaseline = this.sampleData(baseline, sampleSize);

      return super.detectStatisticalDrift(sampledBaseline, sampledCurrent);
    }

    return super.detectStatisticalDrift(baseline, current);
  }

  private sampleData(data: any[], sampleSize: number): any[] {
    const shuffled = [...data].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, sampleSize);
  }
}
```

## Configuration Best Practices

```typescript
// drift-config.json
{
  "detection": {
    "statistical_threshold": 0.05,    // More sensitive = lower value
    "quality_threshold": 0.1,         // 10% change triggers alert
    "categorical_threshold": 0.05,    // 5% new categories
    "sample_size": 1000,             // For large datasets
    "enable_caching": true
  },
  "monitoring": {
    "default_interval_minutes": 60,
    "high_priority_interval_minutes": 15,
    "batch_size": 5000,
    "max_history_days": 30
  },
  "alerts": {
    "email": {
      "enabled": true,
      "recipients": ["data-team@company.com"],
      "severity_threshold": "medium"
    },
    "slack": {
      "enabled": true,
      "webhook_url": "https://hooks.slack.com/...",
      "channel": "#data-alerts"
    }
  }
}
```

## Testing Your Drift Detection

```bash
# Run the complete example
npx ts-node src/drift-monitoring.ts

# Expected output:
# 🚀 Setting up Drift Monitoring System
# ⏰ Scheduling monitoring for customers every 30 minutes
# ⏰ Scheduling monitoring for orders every 15 minutes
# ✅ Drift monitoring system is running!
# 📊 Dashboard saved to drift-dashboard.md
```

## Key Takeaways

1. **Early Detection**: Catch drift before it breaks pipelines
2. **Multiple Drift Types**: Statistical, quality, categorical, and pattern drift
3. **Automated Monitoring**: Schedule regular checks with intelligent frequency adjustment
4. **Performance Optimization**: Use sampling and batching for large datasets
5. **Actionable Alerts**: Different severity levels with appropriate responses

## Next Steps

- **[How-to: Configure Drift Alerts](../how-to/drift-alerts.md)**
- **[How-to: Optimize Drift Detection Performance](../how-to/drift-performance.md)**
- **[Tutorial: Integrating with dbt](dbt-integration.md)**
