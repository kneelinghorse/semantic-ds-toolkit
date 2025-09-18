import { QuickStartDemo } from './quick-start.js';
import { InteractiveInitWizard } from './interactive-init.js';
import { InferenceProgressReporter } from './progress-reporter.js';
import { withErrorHandler } from './error-handler.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface QuickstartOptions {
  demo?: boolean;
  interactive?: boolean;
  sample?: string;
  output?: string;
  format?: 'table' | 'json' | 'yaml';
  skip?: string[];
  dryRun?: boolean;
}

export const quickstartCommand = withErrorHandler('quickstart', async (options: QuickstartOptions) => {
  console.log(chalk.blue.bold('🚀 Semantic Data Science Toolkit - Quickstart'));
  console.log(chalk.gray('Experience the power of semantic data analysis!\n'));

  // Determine flow based on options and user preference
  const flow = await determineFlow(options);

  switch (flow) {
    case 'demo':
      await runDemo(options);
      break;
    case 'interactive':
      await runInteractiveSetup(options);
      break;
    case 'instant':
      await runInstantDemo(options);
      break;
    default:
      await showQuickstartMenu();
  }
});

async function determineFlow(options: QuickstartOptions): Promise<'demo' | 'interactive' | 'instant' | 'menu'> {
  if (options.demo) return 'demo';
  if (options.interactive) return 'interactive';

  // Check if user wants instant demo (default)
  if (!process.stdin.isTTY) return 'instant';

  return 'menu';
}

async function showQuickstartMenu(): Promise<void> {
  console.log(chalk.cyan('Choose your quickstart experience:'));

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'What would you like to do?',
      choices: [
        {
          name: '⚡ Instant Demo - See results in <3 minutes',
          value: 'instant',
          short: 'Instant Demo'
        },
        {
          name: '🎮 Interactive Demo - Guided experience with explanations',
          value: 'demo',
          short: 'Interactive Demo'
        },
        {
          name: '🏗️  Full Setup - Create a complete project',
          value: 'setup',
          short: 'Full Setup'
        },
        {
          name: '📚 Learn More - Understanding semantic data science',
          value: 'learn',
          short: 'Learn More'
        }
      ]
    }
  ]);

  switch (choice) {
    case 'instant':
      await runInstantDemo({});
      break;
    case 'demo':
      await runDemo({});
      break;
    case 'setup':
      await runInteractiveSetup({});
      break;
    case 'learn':
      await showLearningPath();
      break;
  }
}

async function runInstantDemo(options: QuickstartOptions): Promise<void> {
  console.log(chalk.green.bold('⚡ Instant Demo Mode'));
  console.log(chalk.gray('Running optimized demo for maximum speed...\n'));

  const demo = new QuickStartDemo();
  await demo.run(options);

  // Quick follow-up
  console.log(chalk.cyan('\n🎯 Next Steps:'));
  console.log(chalk.white('  1. Try with your data: ') + chalk.yellow('semantic-ds infer your-file.csv'));
  console.log(chalk.white('  2. Full setup: ') + chalk.yellow('semantic-ds init --interactive'));
  console.log(chalk.white('  3. Get help: ') + chalk.yellow('semantic-ds --help'));
}

async function runDemo(options: QuickstartOptions): Promise<void> {
  console.log(chalk.green.bold('🎮 Interactive Demo Mode'));
  console.log(chalk.gray('Enhanced demo with explanations and insights...\n'));

  // Step 1: Introduction
  await showDemoIntroduction();

  // Step 2: Run the demo with explanations
  const demo = new QuickStartDemo();
  await demo.run(options);

  // Step 3: Deep dive explanations
  await showDemoExplanations();

  // Step 4: Next steps
  await showNextStepsMenu();
}

async function runInteractiveSetup(options: QuickstartOptions): Promise<void> {
  console.log(chalk.green.bold('🏗️ Interactive Project Setup'));
  console.log(chalk.gray('Creating a customized semantic data science project...\n'));

  const wizard = new InteractiveInitWizard();
  await wizard.run();

  console.log(chalk.green('\n✅ Project setup complete!'));
  console.log(chalk.cyan('You can now start analyzing your data.'));
}

async function showDemoIntroduction(): Promise<void> {
  console.log(chalk.cyan('📖 What you\'ll see in this demo:'));
  console.log(chalk.white('   1. 🔍 Automatic data pattern recognition'));
  console.log(chalk.white('   2. 🧠 Semantic type inference (email, phone, etc.)'));
  console.log(chalk.white('   3. 🔗 Intelligent join condition detection'));
  console.log(chalk.white('   4. 🔮 SQL query generation'));
  console.log(chalk.white('   5. ⏱️  Time savings calculation'));

  console.log(chalk.gray('\nPress Enter to begin the demo...'));
  await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
}

async function showDemoExplanations(): Promise<void> {
  console.log(chalk.cyan('\n🔬 What just happened?'));

  const explanations = [
    {
      title: '🧠 Semantic Inference',
      description: 'The toolkit analyzed your data patterns and automatically identified semantic types like emails, phone numbers, and currencies without manual schema definition.'
    },
    {
      title: '🔗 Intelligent Joins',
      description: 'Instead of writing complex JOIN conditions, the system detected relationships between tables based on semantic similarity and data patterns.'
    },
    {
      title: '⚡ Time Savings',
      description: 'Traditional data analysis requires hours of manual schema work, join logic, and validation. Semantic DS automates this entire process.'
    },
    {
      title: '🎯 High Confidence',
      description: 'The inference engine provides confidence scores for each semantic mapping, ensuring reliable automated decisions.'
    }
  ];

  for (const explanation of explanations) {
    console.log(chalk.yellow(`\n${explanation.title}`));
    console.log(chalk.white(`   ${explanation.description}`));
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

async function showNextStepsMenu(): Promise<void> {
  console.log(chalk.cyan('\n🎯 What would you like to do next?'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Choose your next step:',
      choices: [
        {
          name: '📊 Try with my own data',
          value: 'own_data',
          short: 'Own Data'
        },
        {
          name: '🏗️  Set up a full project',
          value: 'setup_project',
          short: 'Setup Project'
        },
        {
          name: '📚 Learn more about features',
          value: 'learn_features',
          short: 'Learn Features'
        },
        {
          name: '🔧 Install tab completion',
          value: 'install_completion',
          short: 'Tab Completion'
        },
        {
          name: '👋 Exit',
          value: 'exit',
          short: 'Exit'
        }
      ]
    }
  ]);

  switch (action) {
    case 'own_data':
      await guideOwnDataAnalysis();
      break;
    case 'setup_project':
      await runInteractiveSetup({});
      break;
    case 'learn_features':
      await showFeatureGuide();
      break;
    case 'install_completion':
      await offerTabCompletion();
      break;
    case 'exit':
      console.log(chalk.green('\n✨ Thanks for trying Semantic Data Science Toolkit!'));
      break;
  }
}

async function guideOwnDataAnalysis(): Promise<void> {
  console.log(chalk.cyan('\n📊 Analyzing Your Own Data'));

  const { hasData } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasData',
      message: 'Do you have data files (CSV, JSON, Parquet) ready to analyze?',
      default: true
    }
  ]);

  if (hasData) {
    console.log(chalk.white('\n🎯 Here\'s how to analyze your data:'));
    console.log(chalk.yellow('   semantic-ds infer path/to/your/data.csv'));
    console.log(chalk.white('\nFor multiple files:'));
    console.log(chalk.yellow('   semantic-ds infer data/*.csv'));
    console.log(chalk.white('\nWith custom confidence threshold:'));
    console.log(chalk.yellow('   semantic-ds infer data.csv --confidence 0.8'));
    console.log(chalk.white('\nTo save results:'));
    console.log(chalk.yellow('   semantic-ds infer data.csv --output results.json'));
  } else {
    console.log(chalk.white('\n📁 Getting sample data:'));
    console.log(chalk.yellow('   1. Download from: https://github.com/semantic-ds/sample-data'));
    console.log(chalk.yellow('   2. Or create a simple CSV file with headers'));
    console.log(chalk.yellow('   3. Then run: semantic-ds infer your-file.csv'));
  }

  console.log(chalk.gray('\n💡 Tip: Use --verbose flag to see detailed analysis progress'));
}

async function showFeatureGuide(): Promise<void> {
  console.log(chalk.cyan('\n🌟 Semantic Data Science Toolkit Features:'));

  const features = [
    {
      name: '🔍 Semantic Inference',
      command: 'semantic-ds infer',
      description: 'Automatically detect data types, patterns, and semantic meaning'
    },
    {
      name: '✅ Data Validation',
      command: 'semantic-ds validate',
      description: 'Ensure data quality and consistency across datasets'
    },
    {
      name: '🏥 Health Monitoring',
      command: 'semantic-ds health',
      description: 'Monitor system performance and semantic coverage'
    },
    {
      name: '🎯 Project Initialization',
      command: 'semantic-ds init',
      description: 'Set up new projects with templates and best practices'
    },
    {
      name: '📊 Performance Benchmarking',
      command: 'semantic-ds benchmark',
      description: 'Measure and optimize data processing performance'
    }
  ];

  features.forEach(feature => {
    console.log(chalk.yellow(`\n${feature.name}`));
    console.log(chalk.white(`   ${feature.description}`));
    console.log(chalk.gray(`   Command: ${feature.command}`));
  });

  console.log(chalk.cyan('\n📚 For detailed documentation:'));
  console.log(chalk.yellow('   semantic-ds help [command]'));
  console.log(chalk.yellow('   https://docs.semantic-ds.com'));
}

async function showLearningPath(): Promise<void> {
  console.log(chalk.cyan('\n📚 Learning Path: Semantic Data Science'));

  const concepts = [
    {
      title: '🎯 What is Semantic Data Science?',
      description: 'Automatically understanding the meaning and relationships in your data, not just the structure.'
    },
    {
      title: '🔍 Semantic Types',
      description: 'Identifying that a column contains emails, phone numbers, or currencies without manual annotation.'
    },
    {
      title: '🧠 Inference Engine',
      description: 'Machine learning models that recognize patterns and assign semantic meaning to data.'
    },
    {
      title: '🔗 Intelligent Joins',
      description: 'Automatically finding relationships between datasets based on semantic similarity.'
    },
    {
      title: '⚡ Time Savings',
      description: 'Reducing hours of manual data analysis work to minutes of automated processing.'
    }
  ];

  for (const concept of concepts) {
    console.log(chalk.yellow(`\n${concept.title}`));
    console.log(chalk.white(`   ${concept.description}`));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(chalk.cyan('\n🚀 Ready to try it? Run the demo:'));
  console.log(chalk.yellow('   semantic-ds quickstart --demo'));
}

async function offerTabCompletion(): Promise<void> {
  console.log(chalk.cyan('\n🔧 Tab Completion Setup'));

  const { shell } = await inquirer.prompt([
    {
      type: 'list',
      name: 'shell',
      message: 'Which shell are you using?',
      choices: [
        { name: 'Bash', value: 'bash' },
        { name: 'Zsh', value: 'zsh' },
        { name: 'Fish', value: 'fish' },
        { name: 'Not sure', value: 'detect' }
      ]
    }
  ]);

  if (shell === 'detect') {
    console.log(chalk.white('\n🔍 To find your shell, run:'));
    console.log(chalk.yellow('   echo $SHELL'));
    console.log(chalk.white('\nThen run:'));
    console.log(chalk.yellow('   semantic-ds completion install <shell-name>'));
  } else {
    console.log(chalk.white(`\n⚙️  To install ${shell} completion:`));
    console.log(chalk.yellow(`   semantic-ds completion install ${shell}`));
  }
}

// Time tracking for performance metrics
class QuickstartTimer {
  private startTime: number = Date.now();
  private milestones: Record<string, number> = {};

  mark(milestone: string): void {
    this.milestones[milestone] = Date.now() - this.startTime;
  }

  getTotal(): number {
    return Date.now() - this.startTime;
  }

  getMilestone(milestone: string): number {
    return this.milestones[milestone] || 0;
  }

  report(): void {
    const total = this.getTotal() / 1000;
    console.log(chalk.gray(`\n⏱️  Quickstart completed in ${total.toFixed(1)}s`));

    Object.entries(this.milestones).forEach(([milestone, time]) => {
      console.log(chalk.gray(`   ${milestone}: ${(time / 1000).toFixed(1)}s`));
    });
  }
}
