/**
 * Semantic Join Examples and Usage Patterns
 *
 * This file demonstrates how to use the semantic join system for various
 * real-world data integration scenarios.
 */

import { CIDRegistry } from '../registry/cid-registry';
import {
  SemanticJoinOperator,
  SemanticJoinFactory,
  SemanticJoinMetrics,
  PERFORMANCE_TARGETS
} from './index';

/**
 * Example 1: Customer Data Integration
 * Scenario: Joining CRM customer data with transaction records
 */
export async function customerDataIntegrationExample(): Promise<void> {
  // Setup CID registry with customer domain concepts
  const cidRegistry = new CIDRegistry();

  cidRegistry.registerPack({
    pack: 'customer-domain',
    version: '1.0.0',
    description: 'Customer management concepts',
    concepts: [
      {
        cid: 'customer.identifier',
        labels: ['customer_id', 'cust_id', 'client_id', 'account_id'],
        description: 'Customer identifier',
        facets: { identifier: true },
        examples: ['CUST-12345', 'C001', 'ACC-98765']
      },
      {
        cid: 'customer.email',
        labels: ['email', 'email_address', 'customer_email', 'contact_email'],
        description: 'Customer email address',
        facets: { pii: true },
        examples: ['customer@example.com']
      },
      {
        cid: 'customer.name',
        labels: ['name', 'customer_name', 'full_name', 'client_name'],
        description: 'Customer full name',
        facets: { pii: true },
        examples: ['John Smith']
      }
    ]
  });

  // Create optimized join operator
  const joinOperator = SemanticJoinFactory.createOptimized(cidRegistry, {
    enableHighAccuracy: true
  });

  // Sample CRM data
  const crmData = {
    customer_id: ['CUST-001', 'CUST-002', 'CUST-003', 'CUST-004'],
    email: ['alice@company.com', 'bob@startup.io', 'charlie@corp.net', 'diana@firm.org'],
    full_name: ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince'],
    registration_date: ['2023-01-15', '2023-02-20', '2023-03-10', '2023-04-05'],
    customer_segment: ['Premium', 'Standard', 'Premium', 'Enterprise']
  };

  // Sample transaction data (possibly from different system)
  const transactionData = {
    cust_id: ['CUST-001', 'CUST-002', 'CUST-005', 'CUST-001', 'CUST-003'],
    purchase_amount: [150.00, 299.99, 89.50, 75.25, 450.00],
    purchase_date: ['2023-01-20', '2023-02-25', '2023-04-10', '2023-01-25', '2023-03-15'],
    product_category: ['Electronics', 'Books', 'Clothing', 'Electronics', 'Software']
  };

  // Get optimized join options for customer matching
  const joinOptions = SemanticJoinFactory.getDefaultOptions('customer_matching');

  // Perform semantic join
  const result = await joinOperator.semanticJoin(crmData, transactionData, {
    ...joinOptions,
    leftOn: 'customer_id',
    rightOn: 'cust_id',
    how: 'left' // Keep all customers, even without transactions
  });

  // Record metrics
  SemanticJoinMetrics.recordJoinPerformance('customer-integration-001', result);

  console.log('=== Customer Data Integration Results ===');
  console.log(`Input: ${result.statistics.inputRowsLeft} customers, ${result.statistics.inputRowsRight} transactions`);
  console.log(`Output: ${result.statistics.outputRows} enriched customer records`);
  console.log(`Matches: ${result.statistics.matchedRows} customers with transactions`);
  console.log(`Average confidence: ${(result.statistics.confidence.average * 100).toFixed(1)}%`);
  console.log(`Execution time: ${result.performance.totalTime.toFixed(2)}ms`);

  // Validate against performance targets
  if (result.performance.totalTime <= PERFORMANCE_TARGETS.MAX_TIME_100K_ROWS * (result.statistics.inputRowsLeft + result.statistics.inputRowsRight) / 100000) {
    console.log('✓ Performance target met');
  } else {
    console.log('⚠ Performance target missed');
  }
}

/**
 * Example 2: Product Catalog Synchronization
 * Scenario: Joining product master data with inventory levels from warehouse system
 */
export async function productCatalogSyncExample(): Promise<void> {
  const cidRegistry = new CIDRegistry();

  cidRegistry.registerPack({
    pack: 'product-domain',
    version: '1.0.0',
    description: 'Product catalog concepts',
    concepts: [
      {
        cid: 'product.sku',
        labels: ['sku', 'product_code', 'item_code', 'part_number'],
        description: 'Product SKU identifier',
        facets: { identifier: true },
        examples: ['SKU-12345', 'PROD-001', 'ITM-98765']
      },
      {
        cid: 'product.name',
        labels: ['product_name', 'item_name', 'title', 'description'],
        description: 'Product name or title',
        facets: { categorical: true },
        examples: ['Wireless Headphones']
      }
    ]
  });

  const joinOperator = new SemanticJoinOperator(cidRegistry);

  // Product master data
  const catalogData = {
    sku: ['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004'],
    product_name: ['Wireless Headphones', 'Smart Watch', 'Bluetooth Speaker', 'USB Charger'],
    category: ['Electronics', 'Wearables', 'Audio', 'Accessories'],
    price: [99.99, 299.99, 79.99, 19.99],
    brand: ['TechCorp', 'SmartTech', 'AudioPlus', 'TechCorp']
  };

  // Warehouse inventory data
  const inventoryData = {
    product_code: ['SKU-001', 'SKU-002', 'SKU-005', 'SKU-003'],
    warehouse_location: ['WH-North', 'WH-South', 'WH-East', 'WH-North'],
    stock_quantity: [150, 75, 200, 89],
    last_restocked: ['2023-03-01', '2023-03-15', '2023-03-20', '2023-02-28'],
    reorder_point: [50, 25, 100, 30]
  };

  const result = await joinOperator.semanticJoin(catalogData, inventoryData, {
    leftOn: 'sku',
    rightOn: 'product_code',
    how: 'outer', // Show all products and all inventory items
    confidenceThreshold: 0.95, // High confidence for exact product matching
    enableFuzzyMatching: false // Exact matches only for product codes
  });

  console.log('\n=== Product Catalog Synchronization Results ===');
  console.log(`Catalog products: ${result.statistics.inputRowsLeft}`);
  console.log(`Inventory items: ${result.statistics.inputRowsRight}`);
  console.log(`Synchronized records: ${result.statistics.outputRows}`);
  console.log(`Exact matches: ${result.statistics.matchedRows}`);
  console.log(`Join accuracy: ${(result.statistics.confidence.average * 100).toFixed(1)}%`);

  // Check which products have no inventory
  const noInventoryCount = result.statistics.inputRowsLeft -
    result.matches.filter(m => m.matchType === 'exact').length;
  if (noInventoryCount > 0) {
    console.log(`⚠ ${noInventoryCount} products missing inventory data`);
  }
}

/**
 * Example 3: Employee Data Deduplication
 * Scenario: Finding duplicate employee records across HR and payroll systems
 */
export async function employeeDeduplicationExample(): Promise<void> {
  const cidRegistry = new CIDRegistry();

  cidRegistry.registerPack({
    pack: 'employee-domain',
    version: '1.0.0',
    description: 'Employee management concepts',
    concepts: [
      {
        cid: 'employee.email',
        labels: ['email', 'work_email', 'corporate_email'],
        description: 'Employee work email',
        facets: { pii: true, identifier: true },
        examples: ['john.doe@company.com']
      },
      {
        cid: 'employee.name',
        labels: ['name', 'full_name', 'employee_name'],
        description: 'Employee full name',
        facets: { pii: true },
        examples: ['John Doe']
      }
    ]
  });

  const joinOperator = new SemanticJoinOperator(cidRegistry);

  // HR system data
  const hrSystemData = {
    emp_id: ['EMP001', 'EMP002', 'EMP003', 'EMP004'],
    employee_name: ['John A. Doe', 'Jane M. Smith', 'Robert Johnson', 'Sarah Wilson'],
    email: ['john.doe@company.com', 'j.smith@company.com', 'bob.johnson@company.com', 'sarah.w@company.com'],
    department: ['Engineering', 'Marketing', 'Sales', 'Engineering'],
    hire_date: ['2020-01-15', '2019-06-20', '2021-03-10', '2022-07-01']
  };

  // Payroll system data (potentially with variations in names/emails)
  const payrollSystemData = {
    employee_id: ['PAY001', 'PAY002', 'PAY003', 'PAY004', 'PAY005'],
    full_name: ['John Doe', 'Jane Smith', 'R. Johnson', 'Sara Wilson', 'Mike Brown'],
    work_email: ['john.doe@company.com', 'jane.smith@company.com', 'robert.j@company.com', 'sarah.wilson@company.com', 'mike.brown@company.com'],
    salary: [95000, 75000, 68000, 82000, 71000]
  };

  // Use fuzzy matching for name variations and email differences
  const result = await joinOperator.semanticJoin(hrSystemData, payrollSystemData, {
    leftOn: ['employee_name', 'email'],
    rightOn: ['full_name', 'work_email'],
    how: 'outer',
    confidenceThreshold: 0.6,
    enableFuzzyMatching: true,
    fuzzyThreshold: 0.7,
    autoSelectNormalizers: true
  });

  console.log('\n=== Employee Deduplication Results ===');
  console.log(`HR records: ${result.statistics.inputRowsLeft}`);
  console.log(`Payroll records: ${result.statistics.inputRowsRight}`);
  console.log(`Total deduplicated view: ${result.statistics.outputRows}`);
  console.log(`Confident matches: ${result.matches.filter(m => m.confidence > 0.8).length}`);
  console.log(`Fuzzy matches: ${result.matches.filter(m => m.matchType === 'fuzzy').length}`);

  // Analyze match confidence distribution
  console.log('\nConfidence Distribution:');
  for (const [level, count] of Object.entries(result.statistics.confidence.distribution)) {
    console.log(`  ${level}: ${count} matches`);
  }
}

/**
 * Example 4: High-Performance Large Dataset Join
 * Scenario: Processing 100K+ records efficiently
 */
export async function highPerformanceJoinExample(): Promise<void> {
  const cidRegistry = new CIDRegistry();

  cidRegistry.registerPack({
    pack: 'performance-test',
    version: '1.0.0',
    description: 'Performance testing concepts',
    concepts: [
      {
        cid: 'user.id',
        labels: ['user_id', 'id', 'uid'],
        description: 'User identifier',
        facets: { identifier: true },
        examples: ['USER-12345']
      }
    ]
  });

  // Create high-performance optimized operator
  const joinOperator = SemanticJoinFactory.createOptimized(cidRegistry, {
    enableHighPerformance: true,
    enableLargeDatasets: true
  });

  console.log('\n=== High-Performance Large Dataset Join ===');
  console.log('Generating large test datasets...');

  // Generate large datasets
  const leftSize = 100000;
  const rightSize = 80000;
  const overlapSize = 60000;

  const leftData = {
    user_id: Array.from({length: leftSize}, (_, i) => `USER-${(i + 1).toString().padStart(6, '0')}`),
    email: Array.from({length: leftSize}, (_, i) => `user${i + 1}@domain${Math.floor(i / 1000)}.com`),
    registration_date: Array.from({length: leftSize}, (_, i) => {
      const date = new Date(2020, 0, 1);
      date.setDate(date.getDate() + (i % 1000));
      return date.toISOString().split('T')[0];
    })
  };

  const rightData = {
    uid: Array.from({length: rightSize}, (_, i) => {
      // Create overlap by reusing some user IDs
      if (i < overlapSize) {
        return `USER-${(i + 1).toString().padStart(6, '0')}`;
      }
      return `USER-${(leftSize + i + 1).toString().padStart(6, '0')}`;
    }),
    last_login: Array.from({length: rightSize}, (_, i) => {
      const date = new Date(2023, 0, 1);
      date.setDate(date.getDate() + (i % 365));
      return date.toISOString().split('T')[0];
    }),
    activity_score: Array.from({length: rightSize}, () => Math.floor(Math.random() * 1000))
  };

  console.log(`Left dataset: ${leftSize.toLocaleString()} records`);
  console.log(`Right dataset: ${rightSize.toLocaleString()} records`);
  console.log(`Expected overlap: ${overlapSize.toLocaleString()} records`);

  // Analyze and get suggested configuration
  const analysis = await SemanticJoinFactory.analyzeAndSuggestJoinConfig(
    leftData, rightData, ['user_id'], ['uid'], cidRegistry
  );

  console.log('\nJoin Analysis:');
  console.log(`Configuration confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
  console.log('Reasoning:', analysis.reasoning);
  if (analysis.warnings.length > 0) {
    console.log('Warnings:', analysis.warnings);
  }

  const startTime = performance.now();

  // Perform the join with suggested optimizations
  const result = await joinOperator.semanticJoin(leftData, rightData, {
    ...analysis.suggestedOptions,
    leftOn: 'user_id',
    rightOn: 'uid',
    how: 'inner',
    confidenceThreshold: 0.9
  });

  const endTime = performance.now();

  console.log('\nPerformance Results:');
  console.log(`Total execution time: ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`Join processing time: ${result.performance.totalTime.toFixed(2)}ms`);
  console.log(`Matched records: ${result.statistics.matchedRows.toLocaleString()}`);
  console.log(`Throughput: ${((leftSize + rightSize) / (result.performance.totalTime / 1000)).toFixed(0)} records/second`);

  const cacheStats = joinOperator.getCacheStats();
  console.log(`Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);

  // Validate performance targets
  const targetTime = PERFORMANCE_TARGETS.MAX_TIME_100K_ROWS * (leftSize + rightSize) / 100000;
  if (result.performance.totalTime <= targetTime) {
    console.log(`✓ Performance target met (${targetTime.toFixed(0)}ms target)`);
  } else {
    console.log(`⚠ Performance target missed (${targetTime.toFixed(0)}ms target)`);
  }

  SemanticJoinMetrics.recordJoinPerformance('large-dataset-001', result);
}

/**
 * Example 5: Multi-Column Semantic Join
 * Scenario: Joining on multiple related columns with different semantic types
 */
export async function multiColumnSemanticJoinExample(): Promise<void> {
  const cidRegistry = new CIDRegistry();

  cidRegistry.registerPack({
    pack: 'multi-column-domain',
    version: '1.0.0',
    description: 'Multi-column join concepts',
    concepts: [
      {
        cid: 'person.first_name',
        labels: ['first_name', 'fname', 'given_name'],
        description: 'First name',
        facets: { pii: true },
        examples: ['John']
      },
      {
        cid: 'person.last_name',
        labels: ['last_name', 'lname', 'surname', 'family_name'],
        description: 'Last name',
        facets: { pii: true },
        examples: ['Smith']
      },
      {
        cid: 'temporal.birth_year',
        labels: ['birth_year', 'year_born', 'birth_date'],
        description: 'Birth year',
        facets: { temporal: true },
        examples: ['1985']
      }
    ]
  });

  const joinOperator = new SemanticJoinOperator(cidRegistry);

  // Dataset 1: Survey responses
  const surveyData = {
    first_name: ['John', 'Jane', 'Bob', 'Alice', 'Charlie'],
    last_name: ['Smith', 'Doe', 'Johnson', 'Brown', 'Wilson'],
    birth_year: [1985, 1990, 1978, 1982, 1975],
    survey_score: [85, 92, 78, 88, 95]
  };

  // Dataset 2: Customer records (with slight variations)
  const customerData = {
    fname: ['John', 'Jane', 'Robert', 'Alice', 'Charles'],
    lname: ['Smith', 'Doe', 'Johnson', 'Brown', 'Wilson'],
    year_born: [1985, 1990, 1978, 1982, 1975],
    customer_segment: ['Premium', 'Standard', 'Premium', 'Premium', 'Enterprise']
  };

  const result = await joinOperator.semanticJoin(surveyData, customerData, {
    leftOn: ['first_name', 'last_name', 'birth_year'],
    rightOn: ['fname', 'lname', 'year_born'],
    how: 'inner',
    confidenceThreshold: 0.8,
    enableFuzzyMatching: true,
    autoSelectNormalizers: true
  });

  console.log('\n=== Multi-Column Semantic Join Results ===');
  console.log(`Survey responses: ${result.statistics.inputRowsLeft}`);
  console.log(`Customer records: ${result.statistics.inputRowsRight}`);
  console.log(`Matched records: ${result.statistics.matchedRows}`);
  console.log(`Match confidence: ${(result.statistics.confidence.average * 100).toFixed(1)}%`);

  // Show details of matches
  result.matches.forEach((match, index) => {
    console.log(`Match ${index + 1}: Confidence ${(match.confidence * 100).toFixed(1)}%, Type: ${match.matchType}`);
  });
}

/**
 * Run all examples
 */
export async function runAllExamples(): Promise<void> {
  console.log('🚀 Starting Semantic Join Examples\n');

  try {
    await customerDataIntegrationExample();
    await productCatalogSyncExample();
    await employeeDeduplicationExample();
    await multiColumnSemanticJoinExample();
    await highPerformanceJoinExample();

    // Show overall performance report
    const performanceReport = SemanticJoinMetrics.getPerformanceReport();
    console.log('\n📊 Overall Performance Report');
    console.log(`Total joins executed: ${performanceReport.totalJoins}`);
    console.log(`Average throughput: ${performanceReport.averageThroughput.toFixed(0)} records/second`);
    console.log(`Average confidence: ${(performanceReport.averageConfidence * 100).toFixed(1)}%`);
    console.log(`Average execution time: ${performanceReport.performanceBreakdown.totalTime.toFixed(2)}ms`);

    console.log('\n✅ All examples completed successfully!');

  } catch (error) {
    console.error('❌ Example execution failed:', error);
  }
}

// Export for direct execution
if (require.main === module) {
  runAllExamples();
}