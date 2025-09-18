import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

interface ProjectConfig {
  name: string;
  description: string;
  template: 'quickstart' | 'basic' | 'advanced' | 'enterprise';
  features: string[];
  dataTypes: string[];
  integrations: string[];
}

const FEATURE_OPTIONS = [
  { name: 'Semantic Inference', value: 'inference', checked: true },
  { name: 'Data Validation', value: 'validation', checked: true },
  { name: 'Performance Monitoring', value: 'monitoring', checked: false },
  { name: 'Evidence Replay', value: 'replay', checked: false },
  { name: 'Drift Detection', value: 'drift', checked: false },
  { name: 'Custom Schemas', value: 'schemas', checked: false },
  { name: 'API Integration', value: 'api', checked: false }
];

const DATA_TYPE_OPTIONS = [
  { name: 'CSV Files', value: 'csv', checked: true },
  { name: 'JSON Files', value: 'json', checked: true },
  { name: 'Parquet Files', value: 'parquet', checked: false },
  { name: 'Database Tables', value: 'database', checked: false },
  { name: 'Real-time Streams', value: 'streams', checked: false },
  { name: 'Time Series', value: 'timeseries', checked: false }
];

const INTEGRATION_OPTIONS = [
  { name: 'GitHub Actions', value: 'github', checked: false },
  { name: 'Docker', value: 'docker', checked: false },
  { name: 'Jupyter Notebooks', value: 'jupyter', checked: false },
  { name: 'VS Code Extension', value: 'vscode', checked: false },
  { name: 'Slack Notifications', value: 'slack', checked: false }
];

export class InteractiveInitWizard {
  private config: Partial<ProjectConfig> = {};
  private dryRun: boolean;

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
  }

  async run(): Promise<void> {
    console.log(chalk.blue.bold('🚀 Semantic Data Science Toolkit - Interactive Setup'));
    console.log(chalk.gray('Let\'s create the perfect setup for your data science project!\n'));

    try {
      await this.gatherProjectInfo();
      await this.selectTemplate();
      await this.configureFeatures();
      await this.setupIntegrations();
      await this.confirmAndCreate();
    } catch (error) {
      console.log(chalk.yellow('\n⚠️  Setup cancelled by user'));
      process.exit(0);
    }
  }

  private async gatherProjectInfo(): Promise<void> {
    const currentDir = process.cwd();
    const defaultName = path.basename(currentDir);

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'What\'s your project name?',
        default: defaultName,
        validate: (input: string) => input.trim().length > 0 || 'Project name is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Describe your project in one line:',
        default: 'Intelligent data analysis with semantic mappings'
      }
    ]);

    this.config.name = answers.name;
    this.config.description = answers.description;
  }

  private async selectTemplate(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Choose your project template:',
        choices: [
          {
            name: '🚀 Quickstart - Get up and running in <5 minutes',
            value: 'quickstart',
            short: 'Quickstart'
          },
          {
            name: '📊 Basic - Standard data analysis setup',
            value: 'basic',
            short: 'Basic'
          },
          {
            name: '🔬 Advanced - Full-featured with custom schemas',
            value: 'advanced',
            short: 'Advanced'
          },
          {
            name: '🏢 Enterprise - Production-ready with monitoring',
            value: 'enterprise',
            short: 'Enterprise'
          }
        ],
        default: 'quickstart'
      }
    ]);

    this.config.template = answers.template;
  }

  private async configureFeatures(): Promise<void> {
    if (this.config.template === 'quickstart') {
      this.config.features = ['inference', 'validation'];
      this.config.dataTypes = ['csv', 'json'];
      return;
    }

    const featureAnswers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select features to include:',
        choices: FEATURE_OPTIONS
      },
      {
        type: 'checkbox',
        name: 'dataTypes',
        message: 'What data types will you work with?',
        choices: DATA_TYPE_OPTIONS
      }
    ]);

    this.config.features = featureAnswers.features;
    this.config.dataTypes = featureAnswers.dataTypes;
  }

  private async setupIntegrations(): Promise<void> {
    if (this.config.template === 'quickstart' || this.config.template === 'basic') {
      this.config.integrations = [];
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'integrations',
        message: 'Select integrations to set up:',
        choices: INTEGRATION_OPTIONS
      }
    ]);

    this.config.integrations = answers.integrations;
  }

  private async confirmAndCreate(): Promise<void> {
    console.log(chalk.cyan('\n📋 Project Configuration Summary:'));
    console.log(chalk.white(`   Name: ${this.config.name}`));
    console.log(chalk.white(`   Template: ${this.config.template}`));
    console.log(chalk.white(`   Features: ${this.config.features?.join(', ')}`));
    console.log(chalk.white(`   Data Types: ${this.config.dataTypes?.join(', ')}`));
    if (this.config.integrations?.length) {
      console.log(chalk.white(`   Integrations: ${this.config.integrations.join(', ')}`));
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Create project with this configuration?',
        default: true
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Setup cancelled.'));
      return;
    }

    await this.createProject();
  }

  private async createProject(): Promise<void> {
    const spinner = ora('🏗️  Creating your semantic data science project...').start();

    try {
      const currentDir = process.cwd();

      // Check if directory is suitable
      const files = await fs.readdir(currentDir);
      const hasFiles = files.some(file => !file.startsWith('.') && file !== 'node_modules');

      if (hasFiles) {
        spinner.stop();
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Directory is not empty. Continue anyway?',
            default: false
          }
        ]);

        if (!proceed) {
          console.log(chalk.yellow('Project creation cancelled.'));
          return;
        }

        spinner.start('Creating project in existing directory...');
      }

      if (this.dryRun) {
        spinner.succeed('✅ [Dry run] Project plan ready');
        console.log(chalk.cyan('\n🧪 Dry Run Preview:'));
        const dirs = ['anchors', 'evidence', 'data'];
        if (this.config.features?.includes('schemas')) dirs.push('schemas');
        if (this.config.features?.includes('validation')) dirs.push('validation');
        if (this.config.integrations?.includes('docker')) dirs.push('.docker');
        console.log(chalk.white(`   Would create directories:`));
        dirs.forEach(d => console.log(chalk.gray(`   - ${d}`)));
        console.log(chalk.white(`\n   Would write files:`));
        const files = ['semantic-config.yaml', 'README.md', '.gitignore'];
        if (this.config.template !== 'quickstart') files.push('package.json');
        files.forEach(f => console.log(chalk.gray(`   - ${f}`)));
        if (this.config.template === 'quickstart') {
          console.log(chalk.gray('   - data/sample.csv'));
        }
        if (this.config.integrations?.includes('github')) {
          console.log(chalk.gray('   - .github/workflows/semantic-validation.yml'));
        }
        if (this.config.integrations?.includes('docker')) {
          console.log(chalk.gray('   - Dockerfile'));
        }
      } else {
        // Create directory structure
        await this.createDirectories(currentDir);

        // Generate configuration files
        await this.generateConfigFiles(currentDir);

        // Create sample data if quickstart
        if (this.config.template === 'quickstart') {
          await this.createSampleData(currentDir);
        }

        // Setup integrations
        await this.setupSelectedIntegrations(currentDir);

        spinner.succeed('✅ Project created successfully!');
      }

      await this.showNextSteps();

    } catch (error) {
      spinner.fail('❌ Failed to create project');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  private async createDirectories(projectDir: string): Promise<void> {
    const dirs = ['anchors', 'evidence', 'data'];

    if (this.config.features?.includes('schemas')) {
      dirs.push('schemas');
    }

    if (this.config.features?.includes('validation')) {
      dirs.push('validation');
    }

    if (this.config.integrations?.includes('docker')) {
      dirs.push('.docker');
    }

    for (const dir of dirs) {
      await fs.mkdir(path.join(projectDir, dir), { recursive: true });
    }
  }

  private async generateConfigFiles(projectDir: string): Promise<void> {
    // Main configuration
    const config = this.generateMainConfig();
    await fs.writeFile(
      path.join(projectDir, 'semantic-config.yaml'),
      config,
      'utf-8'
    );

    // README with personalized content
    const readme = this.generateReadme();
    await fs.writeFile(
      path.join(projectDir, 'README.md'),
      readme,
      'utf-8'
    );

    // .gitignore
    const gitignore = this.generateGitignore();
    await fs.writeFile(
      path.join(projectDir, '.gitignore'),
      gitignore,
      'utf-8'
    );

    // Package.json for npm projects
    if (this.config.template !== 'quickstart') {
      const packageJson = this.generatePackageJson();
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
        'utf-8'
      );
    }
  }

  private generateMainConfig(): string {
    const features = this.config.features || [];
    const confidenceThreshold = this.config.template === 'enterprise' ? 0.9 :
                               this.config.template === 'advanced' ? 0.8 : 0.7;

    return `# ${this.config.name} - Semantic Data Science Configuration
project:
  name: "${this.config.name}"
  description: "${this.config.description}"
  version: "1.0.0"
  template: "${this.config.template}"

inference:
  confidence_threshold: ${confidenceThreshold}
  auto_reconcile: true
  statistical_analysis: ${features.includes('monitoring')}
  pattern_matching: true

anchors:
  storage_path: "./anchors"
  backup_enabled: true
  versioning: ${this.config.template === 'enterprise'}

evidence:
  persistence: true
  storage_path: "./evidence"
  replay_enabled: ${features.includes('replay')}

${features.includes('validation') ? `validation:
  strict_mode: ${this.config.template === 'enterprise'}
  schema_validation: ${features.includes('schemas')}
  custom_rules: "./validation/rules.yaml"

` : ''}${features.includes('monitoring') ? `performance:
  benchmarking: true
  profiling: ${this.config.template === 'enterprise'}
  drift_detection: ${features.includes('drift')}

` : ''}${features.includes('drift') ? `drift_detection:
  enabled: true
  thresholds:
    semantic_drift: 0.1
    statistical_drift: 0.05
  alert_channels: ["console"]

` : ''}data_types:
${this.config.dataTypes?.map(type => `  - ${type}`).join('\n') || '  - csv\n  - json'}

${this.config.integrations?.length ? `integrations:
${this.config.integrations.map(integration => `  ${integration}: true`).join('\n')}
` : ''}`;
  }

  private generateReadme(): string {
    const features = this.config.features || [];
    const quickStartCommands = this.generateQuickStartCommands();

    return `# ${this.config.name}

${this.config.description}

## 🚀 Quick Start

${this.config.template === 'quickstart' ? `Get started in under 5 minutes:

\`\`\`bash
# Run the interactive quickstart
semantic-ds quickstart

# Or analyze your data directly
semantic-ds infer data/*.csv
\`\`\`

` : quickStartCommands}

## 📊 Features

${features.map(feature => {
  const featureDescriptions: Record<string, string> = {
    inference: '🔍 **Semantic Inference** - Automatic detection of data semantics',
    validation: '✅ **Data Validation** - Ensure data quality and consistency',
    monitoring: '📈 **Performance Monitoring** - Track system health and performance',
    replay: '⏪ **Evidence Replay** - Debug and audit inference decisions',
    drift: '🌊 **Drift Detection** - Monitor data and model drift over time',
    schemas: '📋 **Custom Schemas** - Define and validate custom data schemas',
    api: '🔗 **API Integration** - REST API for programmatic access'
  };
  return featureDescriptions[feature] || `• ${feature}`;
}).join('\n')}

## 🏗️ Project Structure

\`\`\`
${this.config.name}/
├── semantic-config.yaml    # Main configuration
├── data/                   # Your data files
├── anchors/               # Semantic anchor storage
├── evidence/              # Evidence and confidence data
${features.includes('schemas') ? '├── schemas/               # Custom data schemas\n' : ''}${features.includes('validation') ? '├── validation/            # Validation rules\n' : ''}└── README.md              # This file
\`\`\`

## 🔧 Configuration

Edit \`semantic-config.yaml\` to customize:
- Confidence thresholds
- Feature toggles
- Storage paths
- Integration settings

## 📚 Documentation

- [Getting Started Guide](https://docs.semantic-toolkit.org/getting-started)
- [API Reference](https://docs.semantic-toolkit.org/api)
- [Examples](https://github.com/semantic-toolkit/examples)

## 🤝 Support

- [Issues](https://github.com/semantic-toolkit/anchor/issues)
- [Discussions](https://github.com/semantic-toolkit/anchor/discussions)
- [Documentation](https://docs.semantic-toolkit.org)
`;
  }

  private generateQuickStartCommands(): string {
    const dataTypes = this.config.dataTypes || ['csv'];
    const extensions = dataTypes.map(type => {
      const extMap: Record<string, string> = {
        csv: '*.csv',
        json: '*.json',
        parquet: '*.parquet'
      };
      return extMap[type] || `*.${type}`;
    });

    return `1. **Add your data files** to the \`data/\` directory

2. **Run semantic inference:**
   \`\`\`bash
   semantic-ds infer data/${extensions.join(' data/')}
   \`\`\`

3. **Check system health:**
   \`\`\`bash
   semantic-ds health
   \`\`\`

4. **Validate your data:**
   \`\`\`bash
   semantic-ds validate
   \`\`\`

`;
  }

  private generateGitignore(): string {
    const integrations = this.config.integrations || [];

    return `# Semantic DS
anchors/cache/
evidence/temp/
*.semantic.cache

# Dependencies
node_modules/
*.log

# Temp files
tmp/
temp/

${integrations.includes('jupyter') ? `# Jupyter
.ipynb_checkpoints/
*.ipynb

` : ''}${integrations.includes('docker') ? `# Docker
.docker/logs/

` : ''}${integrations.includes('vscode') ? `# VS Code
.vscode/settings.json

` : ''}# OS
.DS_Store
Thumbs.db
`;
  }

  private generatePackageJson(): object {
    return {
      name: this.config.name?.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: this.config.description,
      scripts: {
        'semantic:infer': 'semantic-ds infer data/*',
        'semantic:health': 'semantic-ds health',
        'semantic:validate': 'semantic-ds validate',
        ...(this.config.template === 'enterprise' && {
          'semantic:monitor': 'semantic-ds monitor --continuous',
          'semantic:benchmark': 'semantic-ds benchmark'
        })
      },
      keywords: ['semantic', 'data-science', 'machine-learning'],
      devDependencies: {
        '@semantic-toolkit/anchor': '^0.1.0'
      }
    };
  }

  private async createSampleData(projectDir: string): Promise<void> {
    const sampleCsv = `id,name,email,created_at,amount
1,"John Doe",john.doe@example.com,2024-01-15,1250.50
2,"Jane Smith",jane.smith@company.com,2024-01-16,3420.75
3,"Bob Johnson",bob.j@startup.io,2024-01-17,890.25
4,"Alice Wilson",alice.wilson@corp.net,2024-01-18,2150.00
5,"Charlie Brown",charlie@personal.email,2024-01-19,670.80`;

    await fs.writeFile(
      path.join(projectDir, 'data', 'sample.csv'),
      sampleCsv,
      'utf-8'
    );
  }

  private async setupSelectedIntegrations(projectDir: string): Promise<void> {
    const integrations = this.config.integrations || [];

    // GitHub Actions
    if (integrations.includes('github')) {
      await fs.mkdir(path.join(projectDir, '.github', 'workflows'), { recursive: true });
      const workflow = `name: Semantic Data Validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Anchor CLI
        run: npm install -g @semantic-toolkit/anchor
      - name: Validate Data
        run: semantic-ds validate --strict
`;
      await fs.writeFile(
        path.join(projectDir, '.github', 'workflows', 'semantic-validation.yml'),
        workflow,
        'utf-8'
      );
    }

    // Docker
    if (integrations.includes('docker')) {
      const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "semantic:monitor"]
`;
      await fs.writeFile(
        path.join(projectDir, 'Dockerfile'),
        dockerfile,
        'utf-8'
      );
    }
  }

  private async showNextSteps(): Promise<void> {
    console.log(chalk.green.bold('\n🎉 Your semantic data science project is ready!\n'));

    console.log(chalk.cyan('📋 Next Steps:'));

    if (this.config.template === 'quickstart') {
      console.log(chalk.white('  1. ⚡ Try the instant demo:'));
      console.log(chalk.yellow('     semantic-ds quickstart'));
      console.log(chalk.white('  2. 📊 Analyze your own data:'));
      console.log(chalk.yellow('     semantic-ds infer data/your-file.csv'));
    } else {
      console.log(chalk.white('  1. 📁 Add your data files to the data/ directory'));
      console.log(chalk.white('  2. 🔍 Run semantic inference:'));
      console.log(chalk.yellow('     semantic-ds infer data/*'));
      console.log(chalk.white('  3. ✅ Validate your setup:'));
      console.log(chalk.yellow('     semantic-ds health'));
    }

    console.log(chalk.white('  4. 📖 Read the README.md for detailed instructions'));
    console.log(chalk.white('  5. ⚙️  Customize semantic-config.yaml for your needs\n'));

    console.log(chalk.gray('💡 Tip: Run "semantic-ds --help" to see all available commands'));

    if (this.config.template === 'quickstart') {
      console.log(chalk.green('\n⏱️  Expected time to first results: < 3 minutes'));
    }
  }
}
