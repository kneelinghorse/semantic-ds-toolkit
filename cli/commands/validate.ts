import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { SmartAnchorReconciler } from '../../src/core/reconciler.js';
import { StableColumnAnchorSystem } from '../../src/core/anchors.js';

interface ValidateOptions {
  config?: string;
  strict?: boolean;
  schema?: string;
}

interface ValidationResult {
  file: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  score: number;
}

interface ValidationError {
  type: string;
  message: string;
  column?: string;
  line?: number;
  severity: 'error' | 'warning';
}

interface ValidationWarning {
  type: string;
  message: string;
  column?: string;
  suggestion?: string;
}

interface ValidationReport {
  timestamp: string;
  totalFiles: number;
  validFiles: number;
  averageScore: number;
  results: ValidationResult[];
  summary: {
    errors: number;
    warnings: number;
    criticalIssues: string[];
  };
}

export async function validateCommand(options: ValidateOptions) {
  const spinner = ora('Starting validation...').start();

  try {
    const currentDir = process.cwd();
    const report: ValidationReport = {
      timestamp: new Date().toISOString(),
      totalFiles: 0,
      validFiles: 0,
      averageScore: 0,
      results: [],
      summary: {
        errors: 0,
        warnings: 0,
        criticalIssues: []
      }
    };

    // Load configuration
    spinner.text = 'Loading configuration...';
    const config = await loadValidationConfig(options.config, currentDir);

    // Load schema if provided
    let schema = null;
    if (options.schema) {
      spinner.text = 'Loading schema...';
      schema = await loadSchema(options.schema);
    }

    // Find files to validate
    spinner.text = 'Scanning for files to validate...';
    const filesToValidate = await findFilesToValidate(currentDir);
    report.totalFiles = filesToValidate.length;

    if (filesToValidate.length === 0) {
      spinner.warn('No files found to validate');
      console.log(chalk.yellow('No semantic mappings or data files found.'));
      console.log(chalk.gray('Run semantic-ds infer to generate mappings first.'));
      return;
    }

    // Validate each file
    for (let i = 0; i < filesToValidate.length; i++) {
      const file = filesToValidate[i];
      spinner.text = `Validating ${path.basename(file)} (${i + 1}/${filesToValidate.length})...`;

      const result = await validateFile(file, config, schema, options.strict || false);
      report.results.push(result);

      if (result.valid) {
        report.validFiles++;
      }

      report.summary.errors += result.errors.filter(e => e.severity === 'error').length;
      report.summary.warnings += result.errors.filter(e => e.severity === 'warning').length + result.warnings.length;
    }

    // Calculate average score
    report.averageScore = report.results.reduce((sum, r) => sum + r.score, 0) / report.results.length;

    // Identify critical issues
    report.summary.criticalIssues = identifyCriticalIssues(report.results);

    spinner.succeed(`Validation completed - ${report.validFiles}/${report.totalFiles} files valid`);

    // Display results
    await displayValidationReport(report);

    // Exit with error code if validation failed
    if (report.validFiles < report.totalFiles) {
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Validation failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function loadValidationConfig(configPath: string | undefined, currentDir: string) {
  const defaultConfig = {
    strictMode: false,
    rules: {
      requiredConfidence: 0.7,
      maxAlternatives: 3,
      requireEvidence: true,
      allowAmbiguousTypes: false
    },
    ignore: ['*.tmp', '*.cache']
  };

  if (!configPath) {
    // Try to find default config
    const possiblePaths = [
      path.join(currentDir, 'semantic-config.yaml'),
      path.join(currentDir, '.semantic-config.yaml'),
      path.join(currentDir, 'validation.config.yaml')
    ];

    for (const possiblePath of possiblePaths) {
      try {
        await fs.access(possiblePath);
        configPath = possiblePath;
        break;
      } catch (error) {
        // Continue to next path
      }
    }
  }

  if (configPath) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      // Simple YAML parsing for basic config (in production, use proper YAML parser)
      return { ...defaultConfig, ...parseSimpleYaml(content) };
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not load config from ${configPath}, using defaults`));
    }
  }

  return defaultConfig;
}

async function loadSchema(schemaPath: string) {
  try {
    const content = await fs.readFile(schemaPath, 'utf-8');

    if (schemaPath.endsWith('.json')) {
      return JSON.parse(content);
    } else if (schemaPath.endsWith('.yaml') || schemaPath.endsWith('.yml')) {
      return parseSimpleYaml(content);
    }

    throw new Error('Unsupported schema format. Use JSON or YAML.');
  } catch (error) {
    throw new Error(`Failed to load schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function findFilesToValidate(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function scanDirectory(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          // Look for semantic files, anchor files, and data files
          if (entry.name.endsWith('.semantic') ||
              entry.name.endsWith('.anchor') ||
              entry.name.endsWith('.csv') ||
              entry.name.endsWith('.json')) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await scanDirectory(directory);
  return files;
}

async function validateFile(filePath: string, config: any, schema: any, strict: boolean): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  let score = 100;

  try {
    const ext = path.extname(filePath);

    if (ext === '.semantic') {
      // Validate semantic mapping files
      await validateSemanticFile(filePath, config, schema, strict, errors, warnings);
    } else if (ext === '.anchor') {
      // Validate anchor files
      await validateAnchorFile(filePath, config, strict, errors, warnings);
    } else if (['.csv', '.json'].includes(ext)) {
      // Validate data files
      await validateDataFile(filePath, config, strict, errors, warnings);
    }

    // Calculate score based on errors and warnings
    const errorPenalty = errors.filter(e => e.severity === 'error').length * 20;
    const warningPenalty = (errors.filter(e => e.severity === 'warning').length + warnings.length) * 5;
    score = Math.max(0, score - errorPenalty - warningPenalty);

  } catch (error) {
    errors.push({
      type: 'system',
      message: `Failed to validate file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'error'
    });
    score = 0;
  }

  return {
    file: filePath,
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings,
    score
  };
}

async function validateSemanticFile(filePath: string, config: any, schema: any, strict: boolean, errors: ValidationError[], warnings: ValidationWarning[]) {
  const content = await fs.readFile(filePath, 'utf-8');

  try {
    const semanticData = JSON.parse(content);

    // Check required fields
    if (!semanticData.inferences) {
      errors.push({
        type: 'structure',
        message: 'Missing inferences field',
        severity: 'error'
      });
      return;
    }

    // Validate each inference
    Object.entries(semanticData.inferences).forEach(([column, inference]: [string, any]) => {
      // Check confidence threshold
      if (inference.confidence < config.rules.requiredConfidence) {
        if (strict) {
          errors.push({
            type: 'confidence',
            message: `Low confidence (${inference.confidence}) below threshold (${config.rules.requiredConfidence})`,
            column,
            severity: 'error'
          });
        } else {
          warnings.push({
            type: 'confidence',
            message: `Low confidence detected`,
            column,
            suggestion: 'Consider re-running inference with more data'
          });
        }
      }

      // Check for evidence requirement
      if (config.rules.requireEvidence && (!inference.evidence || inference.evidence.length === 0)) {
        errors.push({
          type: 'evidence',
          message: 'No evidence provided for inference',
          column,
          severity: strict ? 'error' : 'warning'
        });
      }

      // Check alternatives count
      if (inference.alternatives && inference.alternatives.length > config.rules.maxAlternatives) {
        warnings.push({
          type: 'alternatives',
          message: `Too many alternatives (${inference.alternatives.length} > ${config.rules.maxAlternatives})`,
          column,
          suggestion: 'Review inference quality'
        });
      }

      // Check for ambiguous types
      if (!config.rules.allowAmbiguousTypes && inference.dataType === 'unknown') {
        errors.push({
          type: 'type',
          message: 'Ambiguous data type not allowed in strict mode',
          column,
          severity: 'error'
        });
      }
    });

  } catch (parseError) {
    errors.push({
      type: 'syntax',
      message: 'Invalid JSON format',
      severity: 'error'
    });
  }
}

async function validateAnchorFile(filePath: string, config: any, strict: boolean, errors: ValidationError[], warnings: ValidationWarning[]) {
  const content = await fs.readFile(filePath, 'utf-8');

  try {
    const anchorData = JSON.parse(content);

    // Basic anchor validation
    if (!anchorData.fingerprint) {
      errors.push({
        type: 'structure',
        message: 'Missing fingerprint in anchor',
        severity: 'error'
      });
    }

    if (!anchorData.metadata) {
      warnings.push({
        type: 'metadata',
        message: 'No metadata found',
        suggestion: 'Add metadata for better tracking'
      });
    }

    // Check fingerprint quality
    if (anchorData.fingerprint && anchorData.fingerprint.confidence < 0.8) {
      warnings.push({
        type: 'quality',
        message: 'Low fingerprint confidence',
        suggestion: 'Regenerate anchor with more representative data'
      });
    }

  } catch (parseError) {
    errors.push({
      type: 'syntax',
      message: 'Invalid anchor file format',
      severity: 'error'
    });
  }
}

async function validateDataFile(filePath: string, config: any, strict: boolean, errors: ValidationError[], warnings: ValidationWarning[]) {
  // Check if corresponding semantic file exists
  const semanticFile = filePath + '.semantic';

  try {
    await fs.access(semanticFile);
  } catch (error) {
    if (strict) {
      errors.push({
        type: 'missing_semantic',
        message: 'No semantic analysis found for data file',
        severity: 'error'
      });
    } else {
      warnings.push({
        type: 'missing_semantic',
        message: 'No semantic analysis found',
        suggestion: 'Run semantic-ds infer on this file'
      });
    }
  }

  // Basic file validation
  try {
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      warnings.push({
        type: 'empty_file',
        message: 'File is empty',
        suggestion: 'Remove empty files or add data'
      });
    }
  } catch (error) {
    errors.push({
      type: 'access',
      message: 'Cannot access file',
      severity: 'error'
    });
  }
}

function identifyCriticalIssues(results: ValidationResult[]): string[] {
  const issues: string[] = [];

  const totalErrors = results.reduce((sum, r) => sum + r.errors.filter(e => e.severity === 'error').length, 0);
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  if (totalErrors > results.length * 2) {
    issues.push('High error rate detected across files');
  }

  if (avgScore < 50) {
    issues.push('Low average validation score');
  }

  const filesWithoutSemantics = results.filter(r =>
    r.errors.some(e => e.type === 'missing_semantic')
  ).length;

  if (filesWithoutSemantics > results.length * 0.5) {
    issues.push('Many files lack semantic analysis');
  }

  return issues;
}

async function displayValidationReport(report: ValidationReport) {
  console.log(chalk.blue.bold('\\n🔍 Validation Report'));
  console.log(chalk.gray(`Generated: ${new Date(report.timestamp).toLocaleString()}`));

  // Summary
  const successRate = (report.validFiles / report.totalFiles) * 100;
  const statusColor = successRate >= 90 ? chalk.green : successRate >= 70 ? chalk.yellow : chalk.red;

  console.log(`\\n📊 Summary:`);
  console.log(`  Files Validated: ${report.totalFiles}`);
  console.log(`  Valid Files: ${statusColor(report.validFiles)} (${successRate.toFixed(1)}%)`);
  console.log(`  Average Score: ${report.averageScore.toFixed(1)}/100`);
  console.log(`  Errors: ${chalk.red(report.summary.errors)}`);
  console.log(`  Warnings: ${chalk.yellow(report.summary.warnings)}`);

  // Critical issues
  if (report.summary.criticalIssues.length > 0) {
    console.log(chalk.red.bold('\\n🚨 Critical Issues:'));
    report.summary.criticalIssues.forEach(issue => {
      console.log(`  • ${issue}`);
    });
  }

  // Detailed results
  console.log(chalk.blue.bold('\\n📝 Detailed Results:'));

  for (const result of report.results) {
    const statusIcon = result.valid ? '✅' : '❌';
    const scoreColor = result.score >= 80 ? chalk.green : result.score >= 60 ? chalk.yellow : chalk.red;

    console.log(`\\n  ${statusIcon} ${path.basename(result.file)} - ${scoreColor(result.score.toFixed(0))}/100`);

    // Show errors
    result.errors.forEach(error => {
      const icon = error.severity === 'error' ? '❌' : '⚠️';
      const color = error.severity === 'error' ? chalk.red : chalk.yellow;
      const location = error.column ? ` (${error.column})` : '';
      console.log(`    ${icon} ${color(error.type)}: ${error.message}${location}`);
    });

    // Show warnings
    result.warnings.forEach(warning => {
      const location = warning.column ? ` (${warning.column})` : '';
      console.log(`    ⚠️  ${chalk.yellow(warning.type)}: ${warning.message}${location}`);
      if (warning.suggestion) {
        console.log(`       ${chalk.gray('💡 ' + warning.suggestion)}`);
      }
    });
  }

  // Recommendations
  if (report.summary.errors > 0 || report.summary.warnings > 0) {
    console.log(chalk.blue.bold('\\n💡 Recommendations:'));

    if (report.summary.criticalIssues.includes('Many files lack semantic analysis')) {
      console.log(`  • Run ${chalk.cyan('semantic-ds infer')} on unanalyzed files`);
    }

    if (report.summary.errors > 0) {
      console.log(`  • Fix critical errors before proceeding`);
      console.log(`  • Use ${chalk.cyan('--strict')} mode for production validation`);
    }

    if (report.averageScore < 70) {
      console.log(`  • Review inference quality and confidence thresholds`);
      console.log(`  • Consider re-running analysis with more representative data`);
    }
  }
}

function parseSimpleYaml(content: string): any {
  // This is a very basic YAML parser for simple key-value pairs
  // In production, use a proper YAML library
  const result: any = {};
  const lines = content.split('\\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        // Simple type conversion
        if (value === 'true') result[key] = true;
        else if (value === 'false') result[key] = false;
        else if (!isNaN(Number(value))) result[key] = Number(value);
        else result[key] = value.replace(/^["'](.*)["']$/, '$1');
      }
    }
  }

  return result;
}