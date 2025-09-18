import chalk from 'chalk';
import ora, { Ora } from 'ora';

interface ProgressStep {
  id: string;
  text: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  duration?: number;
  details?: string;
  subSteps?: ProgressStep[];
}

interface ProgressOptions {
  showTimer?: boolean;
  showDetails?: boolean;
  compact?: boolean;
  emoji?: boolean;
}

export class ProgressReporter {
  private steps: ProgressStep[] = [];
  private currentStep: string | null = null;
  private spinner: Ora | null = null;
  private startTime: number = 0;
  private options: ProgressOptions;

  constructor(options: ProgressOptions = {}) {
    this.options = {
      showTimer: true,
      showDetails: false,
      compact: false,
      emoji: true,
      ...options
    };
  }

  addSteps(steps: Omit<ProgressStep, 'status'>[]): void {
    this.steps = steps.map(step => ({ ...step, status: 'pending' }));
  }

  start(title?: string): void {
    this.startTime = Date.now();
    if (title) {
      console.log(chalk.blue.bold(`\n🚀 ${title}\n`));
    }
    this.renderProgress();
  }

  startStep(stepId: string, text?: string): void {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;

    this.currentStep = stepId;
    step.status = 'running';

    if (text) step.text = text;

    if (this.spinner) {
      this.spinner.stop();
    }

    const emoji = this.getStatusEmoji('running');
    this.spinner = ora(`${emoji} ${step.text}`).start();
  }

  updateStep(stepId: string, text: string, details?: string): void {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;

    step.text = text;
    if (details) step.details = details;

    if (this.currentStep === stepId && this.spinner) {
      const emoji = this.getStatusEmoji('running');
      this.spinner.text = `${emoji} ${step.text}`;
    }
  }

  completeStep(stepId: string, text?: string, details?: string): void {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'completed';
    if (text) step.text = text;
    if (details) step.details = details;

    if (this.currentStep === stepId && this.spinner) {
      const emoji = this.getStatusEmoji('completed');
      this.spinner.succeed(`${emoji} ${step.text}`);
      this.spinner = null;
      this.currentStep = null;
    }

    if (this.options.showDetails && details) {
      console.log(chalk.gray(`   ${details}`));
    }
  }

  failStep(stepId: string, error: string, details?: string): void {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'failed';
    step.details = error;

    if (this.currentStep === stepId && this.spinner) {
      const emoji = this.getStatusEmoji('failed');
      this.spinner.fail(`${emoji} ${step.text} - ${error}`);
      this.spinner = null;
      this.currentStep = null;
    }

    if (details) {
      console.log(chalk.red(`   ${details}`));
    }
  }

  skipStep(stepId: string, reason?: string): void {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'skipped';
    if (reason) step.details = reason;

    const emoji = this.getStatusEmoji('skipped');
    console.log(chalk.yellow(`${emoji} ${step.text} - Skipped${reason ? `: ${reason}` : ''}`));
  }

  complete(title?: string): void {
    if (this.spinner) {
      this.spinner.stop();
    }

    const elapsed = (Date.now() - this.startTime) / 1000;
    const completed = this.steps.filter(s => s.status === 'completed').length;
    const failed = this.steps.filter(s => s.status === 'failed').length;
    const skipped = this.steps.filter(s => s.status === 'skipped').length;

    console.log();
    if (title) {
      console.log(chalk.green.bold(`✅ ${title}`));
    }

    console.log(chalk.cyan(`📊 Summary:`));
    console.log(chalk.white(`   ✅ Completed: ${completed}`));
    if (failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${failed}`));
    }
    if (skipped > 0) {
      console.log(chalk.yellow(`   ⏭️  Skipped: ${skipped}`));
    }

    if (this.options.showTimer) {
      console.log(chalk.gray(`   ⏱️  Time: ${elapsed.toFixed(1)}s`));
    }

    console.log();
  }

  private renderProgress(): void {
    if (this.options.compact) return;

    console.log(chalk.cyan('📋 Progress:'));
    this.steps.forEach((step, index) => {
      const emoji = this.getStatusEmoji(step.status);
      const number = `${(index + 1).toString().padStart(2, ' ')}.`;
      console.log(chalk.gray(`   ${number} ${emoji} ${step.text}`));
    });
    console.log();
  }

  private getStatusEmoji(status: ProgressStep['status']): string {
    if (!this.options.emoji) {
      const symbols = {
        pending: '○',
        running: '●',
        completed: '✓',
        failed: '✗',
        skipped: '⊝'
      };
      return symbols[status];
    }

    const emojis = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      skipped: '⏭️'
    };
    return emojis[status];
  }

  // Utility methods for common workflows
  async runWithProgress<T>(
    stepId: string,
    text: string,
    fn: () => Promise<T>,
    successText?: string
  ): Promise<T> {
    this.startStep(stepId, text);
    try {
      const result = await fn();
      this.completeStep(stepId, successText || text);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.failStep(stepId, errorMessage);
      throw error;
    }
  }

  createSubProgress(parentStepId: string): ProgressReporter {
    const subProgress = new ProgressReporter({
      ...this.options,
      compact: true,
      showTimer: false
    });

    // Link sub-progress to parent step
    const parentStep = this.steps.find(s => s.id === parentStepId);
    if (parentStep) {
      parentStep.subSteps = parentStep.subSteps || [];
    }

    return subProgress;
  }
}

// Specialized progress reporters for common tasks

export class InferenceProgressReporter extends ProgressReporter {
  constructor(options: ProgressOptions = {}) {
    super(options);
    this.addSteps([
      { id: 'load', text: 'Loading data files' },
      { id: 'analyze', text: 'Analyzing data patterns' },
      { id: 'infer', text: 'Running semantic inference' },
      { id: 'validate', text: 'Validating results' },
      { id: 'save', text: 'Saving semantic mappings' }
    ]);
  }

  async loadData(loader: () => Promise<any>): Promise<any> {
    return this.runWithProgress('load', 'Loading and parsing data files...', loader, 'Data loaded successfully');
  }

  async analyzePatterns(analyzer: () => Promise<any>): Promise<any> {
    return this.runWithProgress('analyze', 'Analyzing data patterns and structure...', analyzer, 'Pattern analysis complete');
  }

  async runInference(inferrer: () => Promise<any>): Promise<any> {
    return this.runWithProgress('infer', 'Running semantic inference engine...', inferrer, 'Semantic inference complete');
  }

  async validateResults(validator: () => Promise<any>): Promise<any> {
    return this.runWithProgress('validate', 'Validating semantic mappings...', validator, 'Results validated');
  }

  async saveResults(saver: () => Promise<any>): Promise<any> {
    return this.runWithProgress('save', 'Saving semantic mappings...', saver, 'Results saved successfully');
  }
}

export class InitProgressReporter extends ProgressReporter {
  constructor(options: ProgressOptions = {}) {
    super(options);
    this.addSteps([
      { id: 'validate', text: 'Validating project directory' },
      { id: 'create', text: 'Creating project structure' },
      { id: 'config', text: 'Generating configuration files' },
      { id: 'samples', text: 'Creating sample files' },
      { id: 'deps', text: 'Installing dependencies' }
    ]);
  }
}

export class HealthCheckProgressReporter extends ProgressReporter {
  constructor(options: ProgressOptions = {}) {
    super(options);
    this.addSteps([
      { id: 'scan', text: 'Scanning project files' },
      { id: 'coverage', text: 'Analyzing semantic coverage' },
      { id: 'performance', text: 'Running performance checks' },
      { id: 'validation', text: 'Validating configuration' },
      { id: 'report', text: 'Generating health report' }
    ]);
  }
}

// Progress bar utilities
export class BatchProgressReporter {
  private total: number;
  private current: number = 0;
  private spinner: Ora;
  private lastUpdate: number = 0;

  constructor(total: number, title: string) {
    this.total = total;
    this.spinner = ora(this.getProgressText()).start();
  }

  increment(message?: string): void {
    this.current++;
    const now = Date.now();

    // Throttle updates to avoid spam
    if (now - this.lastUpdate > 100) {
      this.spinner.text = this.getProgressText(message);
      this.lastUpdate = now;
    }

    if (this.current >= this.total) {
      this.complete();
    }
  }

  complete(message?: string): void {
    this.spinner.succeed(message || `✅ Processed ${this.total} items`);
  }

  fail(error: string): void {
    this.spinner.fail(`❌ Failed: ${error}`);
  }

  private getProgressText(message?: string): string {
    const percentage = Math.round((this.current / this.total) * 100);
    const bar = this.createProgressBar(percentage);
    const suffix = message ? ` - ${message}` : '';
    return `${bar} ${percentage}% (${this.current}/${this.total})${suffix}`;
  }

  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }
}

// Export utility function for quick progress bars
export function createProgressBar(total: number, title: string): BatchProgressReporter {
  return new BatchProgressReporter(total, title);
}