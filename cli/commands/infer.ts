import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { InferenceEngine, type InferenceOptions, type InferenceResult } from '../../src/inference/index.js';

interface InferCommandOptions {
  output?: string;
  confidence: string;
  verbose?: boolean;
  format: string;
}

interface CLIInferenceResult {
  inferences: Record<string, InferenceResult>;
  metadata: {
    totalRows: number;
    totalColumns: number;
    inferenceOptions: InferenceOptions;
  };
}

interface FileAnalysisResult {
  file: string;
  result: CLIInferenceResult | null;
  error?: string;
  processingTime: number;
}

export async function inferCommand(files: string[], options: InferCommandOptions) {
  const spinner = ora('Starting semantic inference...').start();

  try {
    const confidenceThreshold = parseFloat(options.confidence);
    if (isNaN(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) {
      spinner.fail('Invalid confidence threshold. Must be between 0 and 1.');
      return;
    }

    const inferenceOptions: InferenceOptions = {
      minConfidence: confidenceThreshold,
      enablePatternMatching: true,
      enableStatisticalAnalysis: true,
      enableContextualAnalysis: true
    };

    const engine = new InferenceEngine();
    const results: FileAnalysisResult[] = [];

    spinner.text = `Analyzing ${files.length} file(s)...`;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const startTime = Date.now();

      try {
        if (options.verbose) {
          spinner.text = `Processing ${file} (${i + 1}/${files.length})...`;
        }

        // Check if file exists
        const filePath = path.resolve(file);
        await fs.access(filePath);

        // Determine file type and read data
        const data = await readDataFile(filePath);

        if (!data || data.length === 0) {
          results.push({
            file,
            result: null,
            error: 'No data found in file',
            processingTime: Date.now() - startTime
          });
          continue;
        }

        // Convert data to column format for inference
        const columnData: Record<string, any[]> = {};
        if (data.length > 0) {
          const columns = Object.keys(data[0]);
          columns.forEach(column => {
            columnData[column] = data.map(row => row[column]);
          });
        }

        // Run inference
        const columnResults = await engine.inferDatasetTypes(columnData, inferenceOptions);

        // Convert back to expected format
        const result: CLIInferenceResult = {
          inferences: columnResults,
          metadata: {
            totalRows: data.length,
            totalColumns: Object.keys(columnData).length,
            inferenceOptions
          }
        };

        results.push({
          file,
          result,
          processingTime: Date.now() - startTime
        });

      } catch (error) {
        results.push({
          file,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: Date.now() - startTime
        });
      }
    }

    spinner.succeed(`Completed analysis of ${files.length} file(s)`);

    // Display results
    await displayResults(results, options);

    // Save results if output path specified
    if (options.output) {
      await saveResults(results, options.output, options.format);
      console.log(chalk.green(`\\nResults saved to: ${options.output}`));
    }

    // Summary
    const successful = results.filter(r => r.result !== null).length;
    const failed = results.length - successful;

    console.log(chalk.blue.bold('\\n📊 Summary:'));
    console.log(`  ${chalk.green('✓')} Successful: ${successful}`);
    if (failed > 0) {
      console.log(`  ${chalk.red('✗')} Failed: ${failed}`);
    }

    const totalTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    console.log(`  ${chalk.gray('⏱')} Total time: ${totalTime}ms`);

  } catch (error) {
    spinner.fail('Inference failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function readDataFile(filePath: string): Promise<Record<string, any>[] | null> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    switch (ext) {
      case '.json': {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        return Array.isArray(data) ? data : [data];
      }

      case '.csv': {
        // Simple CSV parsing (in production, you'd use a proper CSV library)
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        if (lines.length < 2) return null;

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: Record<string, any> = {};
          headers.forEach((header, i) => {
            row[header] = values[i] || '';
          });
          return row;
        });

        return rows.filter(row => Object.values(row).some(val => val !== ''));
      }

      case '.parquet': {
        // For now, show a helpful message about Parquet support
        throw new Error('Parquet files require additional dependencies. Please convert to CSV or JSON for now.');
      }

      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function displayResults(results: FileAnalysisResult[], options: InferCommandOptions) {
  for (const { file, result, error, processingTime } of results) {
    console.log(chalk.blue.bold(`\\n📄 ${file}`));

    if (error) {
      console.log(chalk.red(`  ✗ Error: ${error}`));
      continue;
    }

    if (!result) {
      console.log(chalk.yellow('  ⚠ No results'));
      continue;
    }

    console.log(chalk.green(`  ✓ Processed in ${processingTime}ms`));

    if (options.format === 'table') {
      // Display table format
      console.log('\\n  Semantic Inferences:');

      Object.entries(result.inferences).forEach(([column, inference]) => {
        console.log(`    ${chalk.cyan(column)}:`);
        console.log(`      Type: ${chalk.yellow(inference.semanticType)}`);
        console.log(`      Confidence: ${chalk.green((inference.confidence * 100).toFixed(1))}%`);

        if (inference.evidence && inference.evidence.length > 0) {
          console.log(`      Evidence: ${inference.evidence.slice(0, 2).map(e => e.type).join(', ')}`);
        }

        if (inference.alternatives && inference.alternatives.length > 0) {
          const topAlt = inference.alternatives[0];
          console.log(`      Alternative: ${topAlt.semanticType} (${(topAlt.confidence * 100).toFixed(1)}%)`);
        }
      });

    } else if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    }

    if (options.verbose && result.metadata) {
      console.log('\\n  Analysis Metadata:');
      Object.entries(result.metadata).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`);
      });
    }
  }
}

async function saveResults(results: FileAnalysisResult[], outputPath: string, format: string) {
  const output = {
    timestamp: new Date().toISOString(),
    results: results.map(r => ({
      file: r.file,
      success: r.result !== null,
      error: r.error,
      processingTime: r.processingTime,
      inferences: r.result?.inferences,
      metadata: r.result?.metadata
    }))
  };

  let content: string;

  switch (format) {
    case 'json':
      content = JSON.stringify(output, null, 2);
      break;
    case 'yaml':
      // Simple YAML output (in production, use a proper YAML library)
      content = `timestamp: ${output.timestamp}\\nresults:\\n${output.results.map(r =>
        `  - file: "${r.file}"\\n    success: ${r.success}\\n    processingTime: ${r.processingTime}`
      ).join('\\n')}`;
      break;
    default:
      content = JSON.stringify(output, null, 2);
  }

  await fs.writeFile(outputPath, content, 'utf-8');
}