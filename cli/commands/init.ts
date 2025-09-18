import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

interface InitOptions {
  template: string;
  force?: boolean;
}

const templates = {
  basic: {
    name: 'Basic Project',
    description: 'Simple semantic data analysis setup',
    files: {
      'semantic-config.yaml': `# Semantic Data Science Configuration
project:
  name: "my-semantic-project"
  version: "1.0.0"

inference:
  confidence_threshold: 0.7
  auto_reconcile: true

anchors:
  storage_path: "./anchors"
  backup_enabled: true

evidence:
  persistence: true
  storage_path: "./evidence"
`,
      'README.md': `# Semantic Data Science Project

This project uses the Semantic Data Science Toolkit for intelligent data analysis.

## Quick Start

1. Run inference on your data:
   \`\`\`bash
   semantic-ds infer data/*.csv
   \`\`\`

2. Check system health:
   \`\`\`bash
   semantic-ds health
   \`\`\`

3. Validate your mappings:
   \`\`\`bash
   semantic-ds validate
   \`\`\`

## Project Structure

- \`semantic-config.yaml\` - Main configuration
- \`anchors/\` - Semantic anchor storage
- \`evidence/\` - Evidence and confidence data
- \`data/\` - Your data files
`,
      '.gitignore': `# Semantic DS
anchors/cache/
evidence/temp/
*.semantic.cache

# Dependencies
node_modules/
*.log

# Temp files
tmp/
temp/
`
    }
  },
  advanced: {
    name: 'Advanced Project',
    description: 'Full-featured setup with custom schemas and validation',
    files: {
      'semantic-config.yaml': `# Advanced Semantic Data Science Configuration
project:
  name: "my-advanced-project"
  version: "1.0.0"
  description: "Advanced semantic data analysis with custom schemas"

inference:
  confidence_threshold: 0.8
  auto_reconcile: true
  statistical_analysis: true
  pattern_matching: true

anchors:
  storage_path: "./anchors"
  backup_enabled: true
  versioning: true

evidence:
  persistence: true
  storage_path: "./evidence"
  replay_enabled: true

validation:
  strict_mode: true
  schema_validation: true
  custom_rules: "./validation/rules.yaml"

performance:
  benchmarking: true
  profiling: false
`,
      'schemas/data-schema.yaml': `# Custom Data Schema Definition
schemas:
  customer_data:
    fields:
      - name: customer_id
        type: string
        semantic_type: identifier
        required: true
      - name: email
        type: string
        semantic_type: email
        validation: email_format
      - name: created_at
        type: datetime
        semantic_type: timestamp

  transaction_data:
    fields:
      - name: transaction_id
        type: string
        semantic_type: identifier
      - name: amount
        type: number
        semantic_type: currency
        validation: positive_number
`,
      'validation/rules.yaml': `# Custom Validation Rules
rules:
  email_format:
    pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"

  positive_number:
    min: 0

  identifier_format:
    min_length: 3
    max_length: 50
`,
      'README.md': `# Advanced Semantic Data Science Project

This is an advanced setup with custom schemas, validation rules, and comprehensive configuration.

## Features

- Custom data schemas
- Advanced validation rules
- Evidence replay system
- Performance benchmarking
- Strict validation mode

## Quick Start

1. Configure your schemas in \`schemas/\`
2. Set up validation rules in \`validation/\`
3. Run inference with advanced options:
   \`\`\`bash
   semantic-ds infer data/*.csv --confidence 0.8 --verbose
   \`\`\`

## Configuration

Edit \`semantic-config.yaml\` to customize:
- Confidence thresholds
- Validation strictness
- Performance settings
- Storage paths
`,
      '.gitignore': `# Semantic DS
anchors/cache/
evidence/temp/
*.semantic.cache

# Dependencies
node_modules/
*.log

# Temp files
tmp/
temp/

# IDE
.vscode/
.idea/
`
    }
  }
};

export async function initCommand(options: InitOptions) {
  const spinner = ora('Initializing semantic data science project...').start();

  try {
    const currentDir = process.cwd();
    const projectName = path.basename(currentDir);

    // Check if directory is empty (unless force is used)
    if (!options.force) {
      const files = await fs.readdir(currentDir);
      const hasFiles = files.some(file => !file.startsWith('.') && file !== 'node_modules');

      if (hasFiles) {
        spinner.stop();

        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Directory is not empty. Continue anyway?',
            default: false
          }
        ]);

        if (!answers.proceed) {
          console.log(chalk.yellow('Initialization cancelled.'));
          return;
        }

        spinner.start('Continuing initialization...');
      }
    }

    // Get template
    const template = templates[options.template as keyof typeof templates];
    if (!template) {
      spinner.fail(`Unknown template: ${options.template}`);
      console.log(chalk.yellow('Available templates:'));
      Object.entries(templates).forEach(([key, tmpl]) => {
        console.log(`  ${chalk.cyan(key)}: ${tmpl.description}`);
      });
      return;
    }

    spinner.text = `Creating ${template.name} project...`;

    // Create directories
    await fs.mkdir(path.join(currentDir, 'anchors'), { recursive: true });
    await fs.mkdir(path.join(currentDir, 'evidence'), { recursive: true });
    await fs.mkdir(path.join(currentDir, 'data'), { recursive: true });

    if (options.template === 'advanced') {
      await fs.mkdir(path.join(currentDir, 'schemas'), { recursive: true });
      await fs.mkdir(path.join(currentDir, 'validation'), { recursive: true });
    }

    // Create files
    for (const [fileName, content] of Object.entries(template.files)) {
      const filePath = path.join(currentDir, fileName);
      const fileDir = path.dirname(filePath);

      // Ensure directory exists
      await fs.mkdir(fileDir, { recursive: true });

      // Replace placeholders in content
      const processedContent = content.replace(/my-(semantic|advanced)-project/g, projectName);

      await fs.writeFile(filePath, processedContent, 'utf-8');
    }

    spinner.succeed('Project initialized successfully!');

    console.log(chalk.green.bold('\\n🎉 Your semantic data science project is ready!'));
    console.log(chalk.gray('\\nNext steps:'));
    console.log(`  1. Place your data files in the ${chalk.cyan('data/')} directory`);
    console.log(`  2. Run ${chalk.cyan('semantic-ds infer data/*')} to analyze your data`);
    console.log(`  3. Use ${chalk.cyan('semantic-ds health')} to check system status`);

    if (options.template === 'advanced') {
      console.log(`  4. Customize schemas in ${chalk.cyan('schemas/')} directory`);
      console.log(`  5. Define validation rules in ${chalk.cyan('validation/rules.yaml')}`);
    }

    console.log(`\\nConfiguration file: ${chalk.cyan('semantic-config.yaml')}`);

  } catch (error) {
    spinner.fail('Failed to initialize project');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}