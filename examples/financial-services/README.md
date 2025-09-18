# Financial Services Example

**Time to complete**: 10 minutes
**Use case**: Semantic data management for financial institutions

## What This Example Shows

- Financial domain-specific semantic patterns
- Regulatory compliance data lineage
- Cross-system transaction matching
- Risk-aware data quality monitoring
- Real-time fraud detection pipelines

## Quick Start

```bash
cd examples/financial-services
npm install
npm run demo
```

Expected output:
```
🏦 Financial Services Semantic Pipeline Demo

📊 Processing trading data...
  ✅ Matched 15,847 transactions across 3 systems
  ⚠️ 23 suspicious patterns detected
  📈 Risk score: 2.3/10 (Low)

🔍 Compliance validation...
  ✅ All PII properly classified
  ✅ Data lineage complete
  ✅ Audit trail generated

💼 Portfolio reconciliation...
  ✅ 99.97% accuracy across book systems
```

## Use Cases Covered

### 1. Transaction Matching Across Systems

**Problem**: Bank has transactions in core banking, card processing, and mobile systems that need to be matched for reconciliation.

```typescript
import { FinancialMatcher, TransactionNormalizer } from './financial-matching';

// Define financial transaction patterns
const financialPatterns = {
  transaction_id: /^TXN-\d{12}$/,
  account_number: /^\d{10,12}$/,
  routing_number: /^\d{9}$/,
  swift_code: /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/,
  iban: /^[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}$/,
  credit_card: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/,
  amount_usd: /^\$?[\d,]+\.\d{2}$/,
  iso_currency: /^[A-Z]{3}$/
};

const matcher = new FinancialMatcher({
  patterns: financialPatterns,
  confidenceThreshold: 0.95, // High threshold for financial data
  enableFraudDetection: true
});

// Match transactions from different systems
const coreBankingTxns = await loadCoreBankingData();
const cardProcessingTxns = await loadCardProcessingData();
const mobileTxns = await loadMobileAppData();

const matches = await matcher.reconcileTransactions({
  coreBanking: coreBankingTxns,
  cardProcessing: cardProcessingTxns,
  mobile: mobileTxns
});

console.log(`Matched ${matches.length} transactions across systems`);
```

### 2. Regulatory Compliance Data Classification

**Problem**: Automatically classify financial data for GDPR, PCI-DSS, and SOX compliance.

```typescript
import { ComplianceClassifier, PIIDetector } from './compliance-tools';

const classifier = new ComplianceClassifier({
  regulations: ['GDPR', 'PCI_DSS', 'SOX', 'CCPA'],
  sensitivityLevels: ['public', 'internal', 'confidential', 'restricted']
});

// Classify customer data
const customerData = await loadCustomerPortfolio();

const classification = await classifier.classifyDataset(customerData, {
  detectPII: true,
  generateLineage: true,
  auditCompliance: true
});

// Results show compliance status
console.log('Compliance Report:');
classification.columns.forEach(col => {
  console.log(`${col.name}: ${col.sensitivityLevel} (${col.regulations.join(', ')})`);
});

// Generate compliance dashboard
await classifier.generateComplianceDashboard('./compliance-report.html');
```

### 3. Real-Time Fraud Detection

**Problem**: Detect suspicious transaction patterns in real-time using semantic anchors.

```typescript
import { FraudDetector, AnomalyEngine } from './fraud-detection';

const fraudDetector = new FraudDetector({
  riskModels: ['velocity', 'amount_deviation', 'geographic', 'merchant_category'],
  realTimeThreshold: 100, // ms
  alertThresholds: {
    low: 0.3,
    medium: 0.6,
    high: 0.8
  }
});

// Stream processing setup
const transactionStream = await createTransactionStream();

transactionStream.on('transaction', async (txn) => {
  const riskScore = await fraudDetector.assessRisk(txn);

  if (riskScore.level === 'high') {
    await fraudDetector.triggerAlert({
      transaction: txn,
      riskScore: riskScore.score,
      reasons: riskScore.reasons,
      suggestedAction: 'BLOCK_TRANSACTION'
    });
  }
});

// Historical pattern learning
await fraudDetector.trainOnHistoricalData({
  fraudulentTransactions: await loadFraudCases(),
  legitimateTransactions: await loadNormalTransactions(),
  features: ['amount', 'merchant', 'time', 'location', 'customer_profile']
});
```

### 4. Portfolio Risk Analytics

**Problem**: Aggregate portfolio data across multiple systems for risk calculations.

```typescript
import { PortfolioAggregator, RiskCalculator } from './portfolio-analytics';

const aggregator = new PortfolioAggregator({
  riskFactors: ['market_risk', 'credit_risk', 'operational_risk', 'liquidity_risk'],
  valuationMethods: ['mark_to_market', 'mark_to_model'],
  currencies: ['USD', 'EUR', 'GBP', 'JPY']
});

// Aggregate positions from multiple books
const positions = await aggregator.aggregatePositions({
  tradingBook: await loadTradingPositions(),
  bankingBook: await loadBankingPositions(),
  derivativesBook: await loadDerivativePositions()
});

// Calculate portfolio metrics
const riskCalculator = new RiskCalculator();
const portfolioMetrics = await riskCalculator.calculate(positions, {
  confidence_level: 0.99,
  holding_period: 1, // days
  include_stress_tests: true
});

console.log('Portfolio Risk Metrics:');
console.log(`VaR (99%, 1 day): ${portfolioMetrics.var_99_1d}`);
console.log(`Expected Shortfall: ${portfolioMetrics.expected_shortfall}`);
console.log(`Maximum Drawdown: ${portfolioMetrics.max_drawdown}`);
```

## Domain-Specific Features

### Financial Data Types
```typescript
// Enhanced type detection for financial data
const financialTypes = {
  'monetary_amount': {
    patterns: [/^\$?[\d,]+\.\d{2}$/, /^[\d,]+\.\d{2}\s?[A-Z]{3}$/],
    validation: (value) => !isNaN(parseFloat(value.replace(/[$,]/g, '')))
  },
  'interest_rate': {
    patterns: [/^\d+\.?\d*%$/, /^\d+\.?\d*\s?bps$/],
    validation: (value) => {
      const rate = parseFloat(value.replace(/[%bps]/g, ''));
      return rate >= 0 && rate <= 100;
    }
  },
  'credit_rating': {
    patterns: [/^[A-Z]{1,3}[+-]?$/, /^[A-Z]{2}\d[+-]?$/],
    categories: ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']
  },
  'cusip': {
    patterns: [/^[0-9A-Z]{9}$/],
    validation: (value) => validateCUSIPChecksum(value)
  },
  'isin': {
    patterns: [/^[A-Z]{2}[0-9A-Z]{9}\d$/],
    validation: (value) => validateISINChecksum(value)
  }
};
```

### Regulatory Data Lineage
```typescript
class RegulatoryLineageTracker {
  async trackDataFlow(dataset: string, transformation: string) {
    const lineage = {
      dataset,
      transformation,
      timestamp: new Date(),
      regulations_applicable: this.identifyRegulations(dataset),
      data_classification: await this.classifyData(dataset),
      retention_period: this.calculateRetentionPeriod(dataset),
      access_controls: await this.getAccessControls(dataset)
    };

    await this.storeLineage(lineage);
    return lineage;
  }

  private identifyRegulations(dataset: string): string[] {
    const regulations = [];

    if (this.containsPII(dataset)) {
      regulations.push('GDPR', 'CCPA');
    }

    if (this.containsPaymentData(dataset)) {
      regulations.push('PCI_DSS');
    }

    if (this.containsFinancialReporting(dataset)) {
      regulations.push('SOX', 'Basel_III');
    }

    return regulations;
  }
}
```

### Currency and Market Data Handling
```typescript
class CurrencySemantics {
  private fxRates: Map<string, number> = new Map();

  async normalizeCurrencyAmounts(data: any[], baseCurrency: string = 'USD') {
    const currencyColumn = this.detectCurrencyColumn(data);
    const amountColumn = this.detectAmountColumn(data);

    if (!currencyColumn || !amountColumn) {
      throw new Error('Cannot detect currency and amount columns');
    }

    return data.map(row => {
      const currency = row[currencyColumn];
      const amount = this.parseAmount(row[amountColumn]);
      const fxRate = this.fxRates.get(`${currency}/${baseCurrency}`) || 1;

      return {
        ...row,
        normalized_amount: amount * fxRate,
        original_amount: amount,
        original_currency: currency,
        base_currency: baseCurrency,
        fx_rate: fxRate
      };
    });
  }

  private detectCurrencyColumn(data: any[]): string | null {
    const headers = Object.keys(data[0]);

    // Look for explicit currency columns
    const currencyHeaders = headers.filter(h =>
      h.toLowerCase().includes('currency') ||
      h.toLowerCase().includes('ccy') ||
      h.toLowerCase() === 'curr'
    );

    if (currencyHeaders.length > 0) {
      return currencyHeaders[0];
    }

    // Look for ISO currency codes in data
    const isoCurrencyPattern = /^[A-Z]{3}$/;
    for (const header of headers) {
      const sample = data.slice(0, 10).map(row => row[header]);
      if (sample.every(val => isoCurrencyPattern.test(val))) {
        return header;
      }
    }

    return null;
  }
}
```

## Security and Compliance Features

### Data Masking for Non-Production
```typescript
class FinancialDataMasker {
  maskSensitiveData(data: any[], environment: 'dev' | 'test' | 'prod' = 'dev'): any[] {
    if (environment === 'prod') {
      return data; // Don't mask production data
    }

    return data.map(row => {
      const masked = { ...row };

      // Mask account numbers
      if (masked.account_number) {
        masked.account_number = this.maskAccountNumber(masked.account_number);
      }

      // Mask SSNs
      if (masked.ssn) {
        masked.ssn = 'XXX-XX-' + masked.ssn.slice(-4);
      }

      // Mask credit card numbers
      if (masked.credit_card) {
        masked.credit_card = 'XXXX-XXXX-XXXX-' + masked.credit_card.slice(-4);
      }

      // Reduce precision of amounts for test data
      if (masked.amount && typeof masked.amount === 'number') {
        masked.amount = Math.round(masked.amount / 100) * 100; // Round to nearest $100
      }

      return masked;
    });
  }

  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return 'X'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
  }
}
```

### Audit Trail Generation
```typescript
class FinancialAuditTrail {
  async logDataAccess(user: string, dataset: string, operation: string, details?: any) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      user,
      dataset,
      operation,
      details: details || {},
      session_id: this.getCurrentSessionId(),
      ip_address: this.getCurrentIPAddress(),
      data_classification: await this.getDataClassification(dataset)
    };

    await this.storeAuditEntry(auditEntry);

    // Check for suspicious access patterns
    await this.checkAccessPattern(user, dataset, operation);
  }

  private async checkAccessPattern(user: string, dataset: string, operation: string) {
    const recentAccess = await this.getRecentAccess(user, '24h');

    // Flag unusual access patterns
    if (recentAccess.length > 100) {
      await this.flagSuspiciousActivity(user, 'HIGH_VOLUME_ACCESS');
    }

    if (recentAccess.filter(a => a.dataset !== dataset).length > 20) {
      await this.flagSuspiciousActivity(user, 'EXCESSIVE_DATASET_ACCESS');
    }
  }
}
```

## Performance Optimizations for Financial Data

### High-Frequency Data Processing
```typescript
class HighFrequencyProcessor {
  private buffer: any[] = [];
  private readonly batchSize = 1000;

  async processMarketData(marketTick: any) {
    this.buffer.push(marketTick);

    if (this.buffer.length >= this.batchSize) {
      await this.flushBuffer();
    }
  }

  private async flushBuffer() {
    const batch = this.buffer.splice(0, this.batchSize);

    // Process in parallel for speed
    await Promise.all([
      this.updateRiskMetrics(batch),
      this.checkRiskLimits(batch),
      this.updatePortfolioValuation(batch),
      this.detectArbitrageOpportunities(batch)
    ]);
  }

  async updateRiskMetrics(batch: any[]) {
    // Ultra-fast risk calculations
    const riskUpdates = batch.map(tick => ({
      instrument: tick.symbol,
      price: tick.price,
      volatility: this.calculateVolatility(tick),
      delta: this.calculateDelta(tick),
      gamma: this.calculateGamma(tick)
    }));

    await this.bulkUpdateRisk(riskUpdates);
  }
}
```

## Files in This Example

```
financial-services/
├── README.md                 # This file
├── package.json             # Dependencies
├── demo.ts                  # Main demo script
├── financial-matching.ts    # Transaction matching logic
├── compliance-tools.ts      # Regulatory compliance
├── fraud-detection.ts       # Real-time fraud detection
├── portfolio-analytics.ts   # Risk calculations
├── data/
│   ├── core-banking-txns.csv      # Sample core banking data
│   ├── card-processing-txns.csv   # Sample card processing data
│   ├── mobile-app-txns.csv        # Sample mobile transactions
│   ├── customer-portfolio.csv     # Customer portfolio data
│   └── market-data.csv            # Market data feed
├── config/
│   ├── compliance-rules.yml       # Regulatory rules
│   ├── fraud-models.yml          # Fraud detection models
│   └── risk-parameters.yml       # Risk calculation parameters
└── tests/
    ├── matching.test.ts           # Transaction matching tests
    ├── compliance.test.ts         # Compliance tests
    └── performance.test.ts        # Performance benchmarks
```

## Key Metrics Tracked

### Data Quality Metrics
- **Transaction Match Rate**: >99.5% across systems
- **False Positive Rate**: <0.1% for fraud detection
- **Data Completeness**: >98% for critical fields
- **Processing Latency**: <100ms for real-time decisions

### Compliance Metrics
- **PII Coverage**: 100% of PII properly classified
- **Audit Trail Completeness**: 100% of data access logged
- **Data Retention Compliance**: 100% adherence to policies
- **Access Control Violations**: 0 unauthorized access events

### Risk Metrics
- **Portfolio VaR Accuracy**: Within 5% of actual losses
- **Risk Limit Monitoring**: 100% of breaches caught in real-time
- **Model Performance**: <2% prediction error on fraud models
- **System Availability**: >99.9% uptime for critical systems

## Next Steps

- **[Retail Analytics Example](../retail-analytics/)** - E-commerce semantic analysis
- **[Healthcare Pipeline Example](../healthcare-pipeline/)** - HIPAA-compliant data processing
- **[Warehouse Validation Example](../warehouse-validation/)** - SQL generation for data warehouses

## Regulatory Resources

- [GDPR Compliance Guide](./docs/gdpr-compliance.md)
- [PCI-DSS Requirements](./docs/pci-dss-requirements.md)
- [SOX Data Controls](./docs/sox-controls.md)
- [Basel III Risk Framework](./docs/basel-iii-framework.md)