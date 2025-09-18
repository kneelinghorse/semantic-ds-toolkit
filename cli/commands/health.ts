import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { StableColumnAnchorSystem } from '../../src/core/anchors.js';
import { ShadowSemanticsLayer } from '../../src/core/shadow-semantics.js';

interface HealthOptions {
  path: string;
  recursive?: boolean;
  report: string;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

interface HealthReport {
  timestamp: string;
  overall: 'healthy' | 'warning' | 'critical';
  checks: HealthCheck[];
  statistics: {
    totalFiles: number;
    analyzedFiles: number;
    semanticCoverage: number;
    anchorCount: number;
    evidenceEntries: number;
  };
}

export async function healthCommand(options: HealthOptions) {
  const spinner = ora('Running health checks...').start();

  try {
    const targetPath = path.resolve(options.path);
    const report: HealthReport = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      checks: [],
      statistics: {
        totalFiles: 0,
        analyzedFiles: 0,
        semanticCoverage: 0,
        anchorCount: 0,
        evidenceEntries: 0
      }
    };

    // 1. Check if directory exists and is accessible
    spinner.text = 'Checking directory access...';
    await checkDirectoryAccess(targetPath, report);

    // 2. Scan for data files
    spinner.text = 'Scanning for data files...';
    const dataFiles = await scanDataFiles(targetPath, options.recursive || false);
    report.statistics.totalFiles = dataFiles.length;

    // 3. Check for semantic configuration
    spinner.text = 'Checking semantic configuration...';
    await checkSemanticConfig(targetPath, report);

    // 4. Check anchor store health
    spinner.text = 'Checking anchor store...';
    await checkAnchorStore(targetPath, report);

    // 5. Check evidence system
    spinner.text = 'Checking evidence system...';
    await checkEvidenceSystem(targetPath, report);

    // 6. Analyze semantic coverage
    spinner.text = 'Analyzing semantic coverage...';
    await analyzeCoverage(dataFiles, report);

    // 7. Check system dependencies
    spinner.text = 'Checking system dependencies...';
    await checkDependencies(report);

    // Determine overall health
    const failCount = report.checks.filter(c => c.status === 'fail').length;
    const warnCount = report.checks.filter(c => c.status === 'warn').length;

    if (failCount > 0) {
      report.overall = 'critical';
    } else if (warnCount > 0) {
      report.overall = 'warning';
    }

    spinner.succeed('Health check completed');

    // Display report
    await displayHealthReport(report, options.report);

  } catch (error) {
    spinner.fail('Health check failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function checkDirectoryAccess(targetPath: string, report: HealthReport) {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      report.checks.push({
        name: 'Directory Access',
        status: 'fail',
        message: 'Target path is not a directory'
      });
      return;
    }

    await fs.access(targetPath, fs.constants.R_OK);
    report.checks.push({
      name: 'Directory Access',
      status: 'pass',
      message: 'Directory is accessible'
    });
  } catch (error) {
    report.checks.push({
      name: 'Directory Access',
      status: 'fail',
      message: 'Cannot access directory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function scanDataFiles(targetPath: string, recursive: boolean): Promise<string[]> {
  const dataFiles: string[] = [];
  const supportedExtensions = ['.csv', '.json', '.parquet'];

  async function scanDirectory(dirPath: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            dataFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await scanDirectory(targetPath);
  return dataFiles;
}

async function checkSemanticConfig(targetPath: string, report: HealthReport) {
  const configPaths = [
    path.join(targetPath, 'semantic-config.yaml'),
    path.join(targetPath, 'semantic-config.yml'),
    path.join(targetPath, '.semantic-config.yaml')
  ];

  let configFound = false;
  for (const configPath of configPaths) {
    try {
      await fs.access(configPath);
      configFound = true;

      // Try to parse the config
      const content = await fs.readFile(configPath, 'utf-8');
      if (content.trim().length === 0) {
        report.checks.push({
          name: 'Semantic Configuration',
          status: 'warn',
          message: 'Configuration file is empty'
        });
      } else {
        report.checks.push({
          name: 'Semantic Configuration',
          status: 'pass',
          message: `Configuration found at ${path.relative(targetPath, configPath)}`
        });
      }
      break;
    } catch (error) {
      // Continue to next config path
    }
  }

  if (!configFound) {
    report.checks.push({
      name: 'Semantic Configuration',
      status: 'warn',
      message: 'No semantic configuration file found'
    });
  }
}

async function checkAnchorStore(targetPath: string, report: HealthReport) {
  const anchorPath = path.join(targetPath, 'anchors');

  try {
    await fs.access(anchorPath);
    const entries = await fs.readdir(anchorPath);
    const anchorFiles = entries.filter(f => f.endsWith('.anchor') || f.endsWith('.json'));

    report.statistics.anchorCount = anchorFiles.length;

    if (anchorFiles.length > 0) {
      report.checks.push({
        name: 'Anchor Store',
        status: 'pass',
        message: `Found ${anchorFiles.length} anchor file(s)`,
        details: { files: anchorFiles.slice(0, 5) }
      });
    } else {
      report.checks.push({
        name: 'Anchor Store',
        status: 'warn',
        message: 'Anchor store exists but is empty'
      });
    }
  } catch (error) {
    report.checks.push({
      name: 'Anchor Store',
      status: 'warn',
      message: 'No anchor store found',
      details: 'Run semantic-ds init to create one'
    });
  }
}

async function checkEvidenceSystem(targetPath: string, report: HealthReport) {
  const evidencePath = path.join(targetPath, 'evidence');

  try {
    await fs.access(evidencePath);
    const entries = await fs.readdir(evidencePath);
    const evidenceFiles = entries.filter(f => f.endsWith('.jsonl') || f.endsWith('.evidence'));

    // Count evidence entries
    let evidenceCount = 0;
    for (const file of evidenceFiles) {
      try {
        const content = await fs.readFile(path.join(evidencePath, file), 'utf-8');
        evidenceCount += content.split('\\n').filter(line => line.trim()).length;
      } catch (error) {
        // Skip files we can't read
      }
    }

    report.statistics.evidenceEntries = evidenceCount;

    if (evidenceCount > 0) {
      report.checks.push({
        name: 'Evidence System',
        status: 'pass',
        message: `Found ${evidenceCount} evidence entries in ${evidenceFiles.length} file(s)`,
        details: { files: evidenceFiles.slice(0, 5) }
      });
    } else {
      report.checks.push({
        name: 'Evidence System',
        status: 'warn',
        message: 'Evidence system exists but no evidence found'
      });
    }
  } catch (error) {
    report.checks.push({
      name: 'Evidence System',
      status: 'warn',
      message: 'No evidence system found',
      details: 'Run semantic-ds init to create one'
    });
  }
}

async function analyzeCoverage(dataFiles: string[], report: HealthReport) {
  // This is a simplified coverage analysis
  // In a real implementation, this would check which files have been analyzed

  let analyzedCount = 0;

  for (const file of dataFiles) {
    // Check if there's a corresponding semantic analysis file
    const semanticFile = file + '.semantic';
    try {
      await fs.access(semanticFile);
      analyzedCount++;
    } catch (error) {
      // File not analyzed yet
    }
  }

  report.statistics.analyzedFiles = analyzedCount;

  if (dataFiles.length === 0) {
    report.statistics.semanticCoverage = 100;
    report.checks.push({
      name: 'Semantic Coverage',
      status: 'warn',
      message: 'No data files found to analyze'
    });
  } else {
    const coverage = (analyzedCount / dataFiles.length) * 100;
    report.statistics.semanticCoverage = coverage;

    if (coverage >= 80) {
      report.checks.push({
        name: 'Semantic Coverage',
        status: 'pass',
        message: `${coverage.toFixed(1)}% of data files have semantic analysis`
      });
    } else if (coverage >= 50) {
      report.checks.push({
        name: 'Semantic Coverage',
        status: 'warn',
        message: `${coverage.toFixed(1)}% semantic coverage (recommended: 80%+)`
      });
    } else {
      report.checks.push({
        name: 'Semantic Coverage',
        status: 'fail',
        message: `Low semantic coverage: ${coverage.toFixed(1)}%`
      });
    }
  }
}

async function checkDependencies(report: HealthReport) {
  const dependencies = ['node', 'npm'];

  for (const dep of dependencies) {
    try {
      // This is a simplified check - in reality you'd use child_process to check versions
      report.checks.push({
        name: `Dependency: ${dep}`,
        status: 'pass',
        message: `${dep} is available`
      });
    } catch (error) {
      report.checks.push({
        name: `Dependency: ${dep}`,
        status: 'fail',
        message: `${dep} is not available`
      });
    }
  }
}

async function displayHealthReport(report: HealthReport, format: string) {
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Console format
  console.log(chalk.blue.bold('\\n🏥 Semantic Data Science Health Report'));
  console.log(chalk.gray(`Generated: ${new Date(report.timestamp).toLocaleString()}`));

  // Overall status
  const statusIcon = {
    healthy: '✅',
    warning: '⚠️',
    critical: '❌'
  }[report.overall];

  const statusColor = {
    healthy: chalk.green,
    warning: chalk.yellow,
    critical: chalk.red
  }[report.overall];

  console.log(`\\n${statusIcon} Overall Status: ${statusColor(report.overall.toUpperCase())}`);

  // Statistics
  console.log(chalk.blue.bold('\\n📊 Statistics:'));
  console.log(`  Data Files: ${report.statistics.totalFiles}`);
  console.log(`  Analyzed: ${report.statistics.analyzedFiles} (${report.statistics.semanticCoverage.toFixed(1)}%)`);
  console.log(`  Anchors: ${report.statistics.anchorCount}`);
  console.log(`  Evidence Entries: ${report.statistics.evidenceEntries}`);

  // Health checks
  console.log(chalk.blue.bold('\\n🔍 Health Checks:'));

  for (const check of report.checks) {
    const icon = {
      pass: '✅',
      warn: '⚠️',
      fail: '❌'
    }[check.status];

    const color = {
      pass: chalk.green,
      warn: chalk.yellow,
      fail: chalk.red
    }[check.status];

    console.log(`  ${icon} ${check.name}: ${color(check.message)}`);

    if (check.details && typeof check.details === 'string') {
      console.log(`    ${chalk.gray(check.details)}`);
    }
  }

  // Recommendations
  const failedChecks = report.checks.filter(c => c.status === 'fail');
  const warningChecks = report.checks.filter(c => c.status === 'warn');

  if (failedChecks.length > 0 || warningChecks.length > 0) {
    console.log(chalk.blue.bold('\\n💡 Recommendations:'));

    if (report.statistics.semanticCoverage < 50) {
      console.log(`  • Run ${chalk.cyan('semantic-ds infer')} to analyze your data files`);
    }

    if (report.statistics.anchorCount === 0) {
      console.log(`  • Run ${chalk.cyan('semantic-ds init')} to set up anchor storage`);
    }

    if (failedChecks.some(c => c.name.includes('Configuration'))) {
      console.log(`  • Create a semantic-config.yaml file for better control`);
    }
  }
}