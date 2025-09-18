import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

interface ErrorContext {
  command: string;
  args: string[];
  workingDir: string;
  timestamp: Date;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
}

interface RecoveryAction {
  id: string;
  title: string;
  description: string;
  command?: string;
  automated?: boolean;
  priority: 'high' | 'medium' | 'low';
}

interface ErrorMapping {
  pattern: RegExp;
  type: 'file_not_found' | 'permission_denied' | 'invalid_config' | 'dependency_missing' | 'network_error' | 'validation_error' | 'unknown';
  title: string;
  description: string;
  recoveryActions: RecoveryAction[];
}

export class EnhancedErrorHandler {
  private context: ErrorContext;
  private errorMappings: ErrorMapping[] = [
    {
      pattern: /ENOENT.*no such file or directory.*semantic-config\.yaml/i,
      type: 'file_not_found',
      title: 'Configuration file not found',
      description: 'The semantic-config.yaml file is missing from your project.',
      recoveryActions: [
        {
          id: 'init_project',
          title: 'Initialize new project',
          description: 'Create a new semantic data science project with default configuration',
          command: 'semantic-ds init',
          automated: false,
          priority: 'high'
        },
        {
          id: 'create_basic_config',
          title: 'Create basic configuration',
          description: 'Generate a minimal semantic-config.yaml file',
          automated: true,
          priority: 'medium'
        }
      ]
    },
    {
      pattern: /EACCES.*permission denied/i,
      type: 'permission_denied',
      title: 'Permission denied',
      description: 'Insufficient permissions to access file or directory.',
      recoveryActions: [
        {
          id: 'check_permissions',
          title: 'Check file permissions',
          description: 'Verify and fix file/directory permissions',
          command: 'ls -la',
          automated: false,
          priority: 'high'
        },
        {
          id: 'run_with_sudo',
          title: 'Run with elevated permissions',
          description: 'Try running the command with sudo (if appropriate)',
          automated: false,
          priority: 'low'
        }
      ]
    },
    {
      pattern: /module not found|cannot resolve module/i,
      type: 'dependency_missing',
      title: 'Missing dependencies',
      description: 'Required Node.js modules are not installed.',
      recoveryActions: [
        {
          id: 'install_deps',
          title: 'Install dependencies',
          description: 'Install missing Node.js dependencies',
          command: 'npm install',
          automated: true,
          priority: 'high'
        },
        {
          id: 'clear_cache',
          title: 'Clear npm cache',
          description: 'Clear npm cache and reinstall dependencies',
          command: 'npm cache clean --force && npm install',
          automated: false,
          priority: 'medium'
        }
      ]
    },
    {
      pattern: /invalid.*yaml|yaml.*parse.*error/i,
      type: 'invalid_config',
      title: 'Invalid configuration file',
      description: 'The semantic-config.yaml file contains syntax errors.',
      recoveryActions: [
        {
          id: 'validate_yaml',
          title: 'Validate YAML syntax',
          description: 'Check and fix YAML syntax errors in configuration file',
          automated: true,
          priority: 'high'
        },
        {
          id: 'restore_backup',
          title: 'Restore from backup',
          description: 'Restore configuration from backup file if available',
          automated: true,
          priority: 'medium'
        },
        {
          id: 'regenerate_config',
          title: 'Regenerate configuration',
          description: 'Create a new configuration file with default settings',
          command: 'semantic-ds init --force',
          automated: false,
          priority: 'low'
        }
      ]
    },
    {
      pattern: /network|timeout|connection.*refused|dns/i,
      type: 'network_error',
      title: 'Network connectivity issue',
      description: 'Unable to connect to external services or repositories.',
      recoveryActions: [
        {
          id: 'check_connection',
          title: 'Check internet connection',
          description: 'Verify your internet connection is working',
          automated: false,
          priority: 'high'
        },
        {
          id: 'retry_offline',
          title: 'Work in offline mode',
          description: 'Continue with cached data and offline functionality',
          automated: true,
          priority: 'medium'
        }
      ]
    },
    {
      pattern: /validation.*failed|invalid.*data.*format/i,
      type: 'validation_error',
      title: 'Data validation failed',
      description: 'The provided data does not meet validation requirements.',
      recoveryActions: [
        {
          id: 'check_data_format',
          title: 'Check data format',
          description: 'Verify your data files are in the correct format (CSV, JSON, etc.)',
          automated: false,
          priority: 'high'
        },
        {
          id: 'run_with_relaxed_validation',
          title: 'Use relaxed validation',
          description: 'Run with lower confidence thresholds or relaxed validation',
          command: 'semantic-ds infer --confidence 0.5 --relaxed',
          automated: false,
          priority: 'medium'
        }
      ]
    }
  ];

  constructor(command: string, args: string[] = []) {
    this.context = {
      command,
      args,
      workingDir: process.cwd(),
      timestamp: new Date(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
  }

  async handleError(error: Error): Promise<void> {
    console.log(); // Add spacing

    // Identify error type and get recovery actions
    const errorInfo = this.analyzeError(error);

    // Display error information
    this.displayErrorHeader(error, errorInfo);
    this.displayErrorDetails(error, errorInfo);

    // Show recovery actions
    await this.displayRecoveryActions(errorInfo.recoveryActions);

    // Log error for debugging
    await this.logError(error, errorInfo);

    // Exit with error code
    process.exit(1);
  }

  private analyzeError(error: Error): { mapping: ErrorMapping | null; recoveryActions: RecoveryAction[] } {
    const errorMessage = error.message + (error.stack || '');

    // Find matching error pattern
    const mapping = this.errorMappings.find(mapping =>
      mapping.pattern.test(errorMessage)
    );

    if (mapping) {
      return { mapping, recoveryActions: mapping.recoveryActions };
    }

    // Default recovery actions for unknown errors
    const defaultActions: RecoveryAction[] = [
      {
        id: 'check_logs',
        title: 'Check error logs',
        description: 'Review detailed error logs for more information',
        automated: false,
        priority: 'high'
      },
      {
        id: 'reinstall',
        title: 'Reinstall toolkit',
        description: 'Reinstall the Semantic Data Science Toolkit',
        command: 'npm uninstall -g @semantic-toolkit/anchor && npm install -g @semantic-toolkit/anchor',
        automated: false,
        priority: 'medium'
      },
      {
        id: 'report_issue',
        title: 'Report issue',
        description: 'Report this issue to the development team',
        automated: false,
        priority: 'low'
      }
    ];

    return { mapping: null, recoveryActions: defaultActions };
  }

  private displayErrorHeader(error: Error, errorInfo: { mapping: ErrorMapping | null }): void {
    console.log(chalk.red.bold('❌ Error occurred while running semantic-ds'));

    if (errorInfo.mapping) {
      console.log(chalk.white(`📍 ${errorInfo.mapping.title}`));
      console.log(chalk.gray(`   ${errorInfo.mapping.description}`));
    } else {
      console.log(chalk.white(`📍 ${error.name || 'Unknown Error'}`));
    }

    console.log(chalk.red(`💥 ${error.message}`));
  }

  private displayErrorDetails(error: Error, errorInfo: { mapping: ErrorMapping | null }): void {
    console.log(chalk.cyan('\n🔍 Error Details:'));
    console.log(chalk.white(`   Command: ${this.context.command} ${this.context.args.join(' ')}`));
    console.log(chalk.white(`   Working Directory: ${this.context.workingDir}`));
    console.log(chalk.white(`   Time: ${this.context.timestamp.toISOString()}`));

    if (errorInfo.mapping) {
      console.log(chalk.white(`   Error Type: ${errorInfo.mapping.type}`));
    }

    // Show stack trace for debugging (abbreviated)
    if (error.stack && process.env.DEBUG) {
      console.log(chalk.gray('\n🐛 Stack Trace (DEBUG):'));
      const stackLines = error.stack.split('\n').slice(0, 5);
      stackLines.forEach(line => {
        console.log(chalk.gray(`   ${line}`));
      });
      console.log(chalk.gray('   ... (use DEBUG=* for full trace)'));
    }
  }

  private async displayRecoveryActions(actions: RecoveryAction[]): Promise<void> {
    if (actions.length === 0) return;

    console.log(chalk.cyan('\n🛠️  Suggested Recovery Actions:'));

    // Sort by priority
    const sortedActions = actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (let i = 0; i < sortedActions.length; i++) {
      const action = sortedActions[i];
      const number = `${i + 1}.`;
      const priority = this.getPriorityIcon(action.priority);

      console.log(chalk.white(`   ${number} ${priority} ${action.title}`));
      console.log(chalk.gray(`      ${action.description}`));

      if (action.command) {
        console.log(chalk.yellow(`      Command: ${action.command}`));
      }

      // Auto-execute high priority automated actions
      if (action.automated && action.priority === 'high') {
        console.log(chalk.blue('      🤖 Attempting automatic recovery...'));
        try {
          await this.executeRecoveryAction(action);
          console.log(chalk.green('      ✅ Recovery action completed successfully'));
        } catch (recoveryError) {
          console.log(chalk.red('      ❌ Automatic recovery failed'));
        }
      }
    }

    console.log(chalk.gray('\n💡 Try the highest priority action first.'));
  }

  private getPriorityIcon(priority: RecoveryAction['priority']): string {
    const icons = {
      high: '🔴',
      medium: '🟡',
      low: '🔵'
    };
    return icons[priority];
  }

  private async executeRecoveryAction(action: RecoveryAction): Promise<void> {
    switch (action.id) {
      case 'create_basic_config':
        await this.createBasicConfig();
        break;
      case 'install_deps':
        await this.installDependencies();
        break;
      case 'validate_yaml':
        await this.validateYamlConfig();
        break;
      case 'restore_backup':
        await this.restoreConfigBackup();
        break;
      case 'retry_offline':
        console.log(chalk.blue('   Switching to offline mode...'));
        process.env.SEMANTIC_DS_OFFLINE = 'true';
        break;
      default:
        throw new Error(`Unknown recovery action: ${action.id}`);
    }
  }

  private async createBasicConfig(): Promise<void> {
    const configPath = path.join(this.context.workingDir, 'semantic-config.yaml');
    const basicConfig = `# Basic Semantic Data Science Configuration
project:
  name: "semantic-project"
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

data_types:
  - csv
  - json
`;

    await fs.writeFile(configPath, basicConfig, 'utf-8');
    console.log(chalk.green(`   ✅ Created basic configuration at ${configPath}`));
  }

  private async installDependencies(): Promise<void> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: this.context.workingDir,
        stdio: 'pipe'
      });

      npm.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });
    });
  }

  private async validateYamlConfig(): Promise<void> {
    const configPath = path.join(this.context.workingDir, 'semantic-config.yaml');

    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const yaml = await import('yaml');
      yaml.parse(configContent); // Will throw if invalid
      console.log(chalk.green('   ✅ YAML configuration is valid'));
    } catch (error) {
      console.log(chalk.red('   ❌ YAML validation failed'));

      // Try to create a backup and fix common issues
      const backupPath = `${configPath}.backup.${Date.now()}`;
      await fs.copyFile(configPath, backupPath);
      console.log(chalk.blue(`   📁 Backup created: ${backupPath}`));

      throw error;
    }
  }

  private async restoreConfigBackup(): Promise<void> {
    const configDir = this.context.workingDir;
    const files = await fs.readdir(configDir);

    const backupFiles = files
      .filter(file => file.match(/semantic-config\.yaml\.backup\.\d+/))
      .sort()
      .reverse(); // Most recent first

    if (backupFiles.length === 0) {
      throw new Error('No backup files found');
    }

    const latestBackup = backupFiles[0];
    const configPath = path.join(configDir, 'semantic-config.yaml');
    const backupPath = path.join(configDir, latestBackup);

    await fs.copyFile(backupPath, configPath);
    console.log(chalk.green(`   ✅ Restored configuration from ${latestBackup}`));
  }

  private async logError(error: Error, errorInfo: { mapping: ErrorMapping | null }): Promise<void> {
    try {
      const logDir = path.join(this.context.workingDir, '.semantic-ds', 'logs');
      await fs.mkdir(logDir, { recursive: true });

      const logEntry = {
        timestamp: this.context.timestamp.toISOString(),
        command: this.context.command,
        args: this.context.args,
        workingDir: this.context.workingDir,
        environment: this.context.environment,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          type: errorInfo.mapping?.type || 'unknown'
        }
      };

      const logFile = path.join(logDir, `error-${Date.now()}.json`);
      await fs.writeFile(logFile, JSON.stringify(logEntry, null, 2), 'utf-8');

      console.log(chalk.gray(`\n📝 Error logged to: ${logFile}`));
    } catch (logError) {
      // Silently fail logging - don't compound the original error
    }
  }

  // Static utility methods
  static handleUncaughtException(error: Error): void {
    const handler = new EnhancedErrorHandler('unknown', []);
    console.log(chalk.red.bold('\n💥 Uncaught Exception:'));
    handler.handleError(error);
  }

  static handleUnhandledRejection(reason: any): void {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const handler = new EnhancedErrorHandler('unknown', []);
    console.log(chalk.red.bold('\n💥 Unhandled Promise Rejection:'));
    handler.handleError(error);
  }

  static setupGlobalHandlers(): void {
    process.on('uncaughtException', EnhancedErrorHandler.handleUncaughtException);
    process.on('unhandledRejection', EnhancedErrorHandler.handleUnhandledRejection);
  }
}

// Utility function for command error handling
export function withErrorHandler<T extends any[], R>(
  command: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const errorHandler = new EnhancedErrorHandler(command, args.map(String));

    try {
      return await fn(...args);
    } catch (error) {
      await errorHandler.handleError(error instanceof Error ? error : new Error(String(error)));
      throw error; // Won't reach here due to process.exit in handleError
    }
  };
}

// Export default instance
export const errorHandler = new EnhancedErrorHandler('semantic-ds');
