// Main CLI exports
export { EnhancedErrorHandler, withErrorHandler } from './error-handler.js';
export { InteractiveInitWizard } from './interactive-init.js';
export { QuickStartDemo } from './quick-start.js';
export { quickstartCommand } from './quickstart-command.js';
export {
  ProgressReporter,
  InferenceProgressReporter,
  InitProgressReporter,
  HealthCheckProgressReporter,
  BatchProgressReporter,
  createProgressBar
} from './progress-reporter.js';
export {
  TabCompletionEngine,
  CompletionInstaller,
  handleCompletionRequest
} from './tab-completion.js';
export {
  OutputFormatter,
  themes,
  output,
  format
} from './output-formatter.js';

// CLI entry point
export * from './enhanced-cli.js';