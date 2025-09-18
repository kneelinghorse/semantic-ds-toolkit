#!/usr/bin/env node

import { PerformanceBenchmark, validatePerformanceTargets, quickPerformanceCheck } from './performance-benchmark';
import { OptimizedBatchProcessorV2 } from './batch-processor-v2';
import { cpus } from 'os';

async function main() {
  console.log('🚀 Batch Processing Optimization - Performance Validation');
  console.log('========================================================\n');

  console.log('System Information:');
  console.log(`- CPU Cores: ${cpus().length}`);
  console.log(`- Node.js: ${process.version}`);
  console.log(`- Architecture: ${process.arch}`);
  console.log(`- Platform: ${process.platform}\n`);

  console.log('Quick Performance Check...');
  try {
    const quickCheck = await quickPerformanceCheck();
    console.log(`✨ Quick Test Results:`);
    console.log(`  Throughput: ${quickCheck.throughput.toFixed(0)} rows/sec`);
    console.log(`  Target Met: ${quickCheck.meetsTarget ? '✅' : '❌'}`);
    console.log(`  Time for 1M rows: ${quickCheck.timeToProcess1M.toFixed(2)}s\n`);

    if (quickCheck.throughput >= 1000000) {
      console.log('🎉 ACHIEVEMENT UNLOCKED: 1M+ rows/sec throughput!');
    } else if (quickCheck.throughput >= 500000) {
      console.log('🔥 Excellent performance: 500K+ rows/sec');
    } else if (quickCheck.throughput >= 250000) {
      console.log('⚡ Good performance: 250K+ rows/sec');
    } else {
      console.log('⚠️  Performance needs improvement');
    }
  } catch (error) {
    console.error('❌ Quick test failed:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Running Comprehensive Validation...\n');

  try {
    const benchmark = new PerformanceBenchmark();
    const results = await benchmark.runComprehensiveValidation();

    console.log('\n🏁 VALIDATION COMPLETE');
    console.log('======================');

    if (results.meetsEnterpriseTargets) {
      console.log('🎯 SUCCESS: All critical targets achieved!');
      console.log('🚀 Ready for enterprise deployment');
    } else {
      console.log('⚠️  Some targets not met - see recommendations above');

      if (results.overallScore >= 0.8) {
        console.log('💪 Strong performance - minor optimizations needed');
      } else if (results.overallScore >= 0.6) {
        console.log('📈 Good progress - moderate improvements needed');
      } else {
        console.log('🔧 Significant optimization required');
      }
    }

    console.log(`\nFinal Score: ${(results.overallScore * 100).toFixed(1)}% (${results.passedTests}/${results.totalTests} tests passed)`);

    benchmark.cleanup();
  } catch (error) {
    console.error('❌ Comprehensive validation failed:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as runPerformanceValidation };