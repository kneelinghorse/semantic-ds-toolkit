#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { inferCommand } from './commands/infer.js';
import { healthCommand } from './commands/health.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('semantic-ds')
  .description('Semantic Data Science Toolkit CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new semantic data science project')
  .option('-t, --template <type>', 'Project template (basic, advanced)', 'basic')
  .option('-f, --force', 'Force initialization in non-empty directory')
  .action(initCommand);

program
  .command('infer')
  .description('Run semantic inference on data files')
  .argument('<files...>', 'Data files to analyze (CSV, Parquet, JSON)')
  .option('-o, --output <path>', 'Output file for inference results')
  .option('-c, --confidence <threshold>', 'Minimum confidence threshold (0-1)', '0.7')
  .option('-v, --verbose', 'Show detailed inference progress')
  .option('--format <type>', 'Output format (json, yaml, table)', 'table')
  .action(inferCommand);

program
  .command('health')
  .description('Check semantic coverage and system health')
  .option('-p, --path <directory>', 'Directory to analyze', '.')
  .option('-r, --recursive', 'Scan directories recursively')
  .option('--report <format>', 'Report format (console, json, html)', 'console')
  .action(healthCommand);

program
  .command('validate')
  .description('Validate semantic mappings and data consistency')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-s, --strict', 'Enable strict validation mode')
  .option('--schema <path>', 'Schema file for validation')
  .action(validateCommand);

program.on('command:*', () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(' ')}`));
  console.log('See --help for a list of available commands.');
  process.exit(1);
});

if (process.argv.length === 2) {
  console.log(chalk.blue.bold('🔬 Semantic Data Science Toolkit'));
  console.log(chalk.gray('Run --help for available commands\n'));
  program.help();
}

program.parse();