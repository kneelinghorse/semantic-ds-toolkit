import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

interface CompletionContext {
  line: string;
  point: number;
  words: string[];
  partial: string;
  command: string;
  subcommand?: string;
}

interface CompletionResult {
  completions: string[];
  prefix?: string;
}

interface CompletionProvider {
  commands: string[];
  options: Record<string, string[]>;
  files: Record<string, string[]>;
  dynamic: Record<string, () => Promise<string[]>>;
}

export class TabCompletionEngine {
  private provider: CompletionProvider;

  constructor() {
    this.provider = {
      commands: [
        'init',
        'infer',
        'health',
        'validate',
        'quickstart',
        'completion',
        'help',
        'version',
        'monitor',
        'benchmark',
        'export',
        'import',
        'configure'
      ],
      options: {
        global: [
          '--help',
          '--version',
          '--verbose',
          '--quiet',
          '--debug',
          '--config',
          '--no-color',
          '--output',
          '--format'
        ],
        init: [
          '--template',
          '--force',
          '--interactive',
          '--sample-data',
          '--features',
          '--integrations'
        ],
        infer: [
          '--output',
          '--confidence',
          '--verbose',
          '--format',
          '--threshold',
          '--parallel',
          '--cache',
          '--dry-run'
        ],
        health: [
          '--path',
          '--recursive',
          '--report',
          '--detailed',
          '--export',
          '--threshold'
        ],
        validate: [
          '--config',
          '--strict',
          '--schema',
          '--output',
          '--fix',
          '--dry-run'
        ],
        quickstart: [
          '--demo',
          '--sample',
          '--output',
          '--format',
          '--interactive'
        ],
        monitor: [
          '--continuous',
          '--interval',
          '--alert',
          '--threshold',
          '--export'
        ],
        export: [
          '--format',
          '--output',
          '--include',
          '--exclude',
          '--compress'
        ],
        import: [
          '--source',
          '--validate',
          '--merge',
          '--backup'
        ]
      },
      files: {
        infer: ['csv', 'json', 'parquet', 'yaml'],
        validate: ['yaml', 'json'],
        export: ['json', 'yaml', 'csv', 'sql'],
        import: ['json', 'yaml', 'zip', 'tar.gz']
      },
      dynamic: {
        'template-names': this.getTemplateNames.bind(this),
        'config-keys': this.getConfigKeys.bind(this),
        'anchor-types': this.getAnchorTypes.bind(this),
        'data-files': this.getDataFiles.bind(this)
      }
    };
  }

  async complete(line: string, point: number): Promise<CompletionResult> {
    const context = this.parseContext(line, point);

    // Command completion
    if (context.words.length <= 1) {
      return this.completeCommands(context);
    }

    // Subcommand and option completion
    const command = context.words[1];
    if (this.provider.commands.includes(command)) {
      return this.completeForCommand(command, context);
    }

    return { completions: [] };
  }

  private parseContext(line: string, point: number): CompletionContext {
    const beforeCursor = line.slice(0, point);
    const words = beforeCursor.trim().split(/\s+/);
    const partial = words[words.length - 1] || '';

    return {
      line,
      point,
      words,
      partial,
      command: words[0] || '',
      subcommand: words[1]
    };
  }

  private completeCommands(context: CompletionContext): CompletionResult {
    const completions = this.provider.commands.filter(cmd =>
      cmd.startsWith(context.partial)
    );

    return { completions };
  }

  private async completeForCommand(command: string, context: CompletionContext): Promise<CompletionResult> {
    const { partial, words } = context;

    // Option completion (starts with -)
    if (partial.startsWith('-')) {
      return this.completeOptions(command, context);
    }

    // File completion based on command
    if (this.shouldCompleteFiles(command, context)) {
      return this.completeFiles(command, context);
    }

    // Value completion for specific options
    if (words.length >= 3) {
      const prevOption = words[words.length - 2];
      return this.completeOptionValue(command, prevOption, context);
    }

    // Command-specific completions
    switch (command) {
      case 'init':
        return this.completeInit(context);
      case 'infer':
        return this.completeInfer(context);
      case 'validate':
        return this.completeValidate(context);
      case 'quickstart':
        return { completions: ['--demo', '--interactive', '--sample', '--output', '--format', '--dry-run'].filter(x => x.startsWith(partial)) };
      case 'health':
        return { completions: ['--path', '--recursive', '--report', '--detailed', '--export', '--threshold', '--dry-run'].filter(x => x.startsWith(partial)) };
      case 'completion': {
        // subcommands and shells
        if (words.length === 2 || (words.length > 2 && !['install','generate'].includes(words[2] || ''))) {
          return { completions: ['install', 'generate'].filter(x => x.startsWith(partial)) };
        }
        if (words.length >= 3) {
          return { completions: ['bash', 'zsh', 'fish'].filter(x => x.startsWith(partial)) };
        }
        return { completions: [] };
      }
      default:
        return { completions: [] };
    }
  }

  private completeOptions(command: string, context: CompletionContext): CompletionResult {
    const commandOptions = this.provider.options[command] || [];
    const globalOptions = this.provider.options.global || [];
    const allOptions = [...commandOptions, ...globalOptions];

    const completions = allOptions.filter(option =>
      option.startsWith(context.partial)
    );

    return { completions };
  }

  private shouldCompleteFiles(command: string, context: CompletionContext): boolean {
    const fileCommands = ['infer', 'validate', 'export', 'import'];
    return fileCommands.includes(command) && !context.partial.startsWith('-');
  }

  private async completeFiles(command: string, context: CompletionContext): Promise<CompletionResult> {
    const allowedExtensions = this.provider.files[command] || [];
    const files = await this.getFileCompletions(context.partial, allowedExtensions);

    return { completions: files };
  }

  private async getFileCompletions(partial: string, allowedExtensions: string[]): Promise<string[]> {
    try {
      const dirPath = path.dirname(partial) || '.';
      const baseName = path.basename(partial);

      const files = await fs.readdir(dirPath);
      const matchingFiles = files.filter(file => {
        // Check if file starts with the partial name
        if (!file.startsWith(baseName)) return false;

        // Check if file has allowed extension
        if (allowedExtensions.length > 0) {
          return allowedExtensions.some(ext => file.endsWith(`.${ext}`));
        }

        return true;
      });

      // Return full paths
      return matchingFiles.map(file =>
        path.join(dirPath, file).replace(/^\.\//, '')
      );
    } catch {
      return [];
    }
  }

  private async completeOptionValue(
    command: string,
    option: string,
    context: CompletionContext
  ): Promise<CompletionResult> {
    switch (option) {
      case '--template':
        return { completions: await this.getTemplateNames() };
      case '--format':
        return { completions: ['json', 'yaml', 'table', 'csv'] };
      case '--confidence':
        return { completions: ['0.5', '0.7', '0.8', '0.9', '0.95'] };
      case '--report':
        return { completions: ['console', 'json', 'html', 'markdown'] };
      case '--interval':
        return { completions: ['1s', '5s', '10s', '1m', '5m', '10m'] };
      default:
        return { completions: [] };
    }
  }

  private completeInit(context: CompletionContext): CompletionResult {
    // For init command, suggest directories and template options
    const suggestions = [
      '--template',
      '--force',
      '--interactive',
      'basic',
      'advanced',
      'quickstart',
      'enterprise'
    ];

    const completions = suggestions.filter(suggestion =>
      suggestion.startsWith(context.partial)
    );

    return { completions };
  }

  private async completeInfer(context: CompletionContext): Promise<CompletionResult> {
    // Suggest data files and common options
    const dataFiles = await this.getDataFiles();
    const options = ['--output', '--confidence', '--verbose', '--format'];

    const all = [...dataFiles, ...options];
    const completions = all.filter(item =>
      item.startsWith(context.partial)
    );

    return { completions };
  }

  private completeValidate(context: CompletionContext): CompletionResult {
    const suggestions = [
      '--config',
      '--strict',
      '--schema',
      'semantic-config.yaml',
      'schemas/',
      'validation/'
    ];

    const completions = suggestions.filter(suggestion =>
      suggestion.startsWith(context.partial)
    );

    return { completions };
  }

  // Dynamic completion providers
  private async getTemplateNames(): Promise<string[]> {
    return ['basic', 'advanced', 'quickstart', 'enterprise'];
  }

  private async getConfigKeys(): Promise<string[]> {
    try {
      const configPath = path.join(process.cwd(), 'semantic-config.yaml');
      const configContent = await fs.readFile(configPath, 'utf-8');
      const yaml = await import('yaml');
      const config = yaml.parse(configContent);

      const keys: string[] = [];
      this.extractKeys(config, '', keys);
      return keys;
    } catch {
      return [];
    }
  }

  private extractKeys(obj: any, prefix: string, keys: string[]): void {
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(key => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        keys.push(fullKey);
        this.extractKeys(obj[key], fullKey, keys);
      });
    }
  }

  private async getAnchorTypes(): Promise<string[]> {
    return [
      'identifier',
      'email',
      'phone',
      'address',
      'timestamp',
      'currency',
      'percentage',
      'url',
      'category',
      'description'
    ];
  }

  private async getDataFiles(): Promise<string[]> {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      const files = await fs.readdir(dataDir);
      return files
        .filter(file => /\.(csv|json|parquet|yaml)$/i.test(file))
        .map(file => `data/${file}`);
    } catch {
      // Fallback to current directory
      try {
        const files = await fs.readdir('.');
        return files.filter(file => /\.(csv|json|parquet|yaml)$/i.test(file));
      } catch {
        return [];
      }
    }
  }
}

// Shell completion script generators
export class CompletionInstaller {
  private engine: TabCompletionEngine;

  constructor() {
    this.engine = new TabCompletionEngine();
  }

  generateBashCompletion(): string {
    return `#!/bin/bash

_semantic_ds_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    # Call the Node.js completion engine
    local completions
    completions=\$(semantic-ds --completion-bash "\${COMP_LINE}" "\${COMP_POINT}")

    COMPREPLY=( \$(compgen -W "\$completions" -- "\$cur") )
    return 0
}

complete -F _semantic_ds_completion semantic-ds
`;
  }

  generateZshCompletion(): string {
    return `#compdef semantic-ds

_semantic_ds() {
    local line state

    _arguments -C \\
        "1: :->commands" \\
        "*: :->args"

    case $state in
        commands)
            local commands=(
                'init:Initialize a new semantic data science project'
                'infer:Run semantic inference on data files'
                'health:Check semantic coverage and system health'
                'validate:Validate semantic mappings and data consistency'
                'quickstart:Quick start demo and setup'
                'completion:Manage shell tab completion'
                'monitor:Monitor semantic data pipeline'
                'benchmark:Run performance benchmarks'
                'help:Show help information'
                'version:Show version information'
            )
            _describe 'command' commands
            ;;
        args)
            case $words[2] in
                init)
                    _arguments \\
                        '--template[Project template]:template:(basic advanced quickstart enterprise)' \\
                        '--force[Force initialization in non-empty directory]' \\
                        '--interactive[Interactive setup wizard]' \\
                        '--dry-run[Preview without writing files]'
                    ;;
                infer)
                    _arguments \\
                        '--output[Output file]:file:_files' \\
                        '--confidence[Confidence threshold]:threshold:(0.5 0.7 0.8 0.9)' \\
                        '--format[Output format]:format:(json yaml table csv)' \\
                        '--dry-run[Preview without writing]' \\
                        '*:file:_files -g "*.{csv,json,parquet}"'
                    ;;
                validate)
                    _arguments \\
                        '--config[Configuration file]:file:_files -g "*.yaml"' \\
                        '--strict[Enable strict validation mode]' \\
                        '--schema[Schema file]:file:_files' \\
                        '--dry-run[No changes]'
                    ;;
                health)
                    _arguments \\
                        '--path[Directory to analyze]:dir:_files -/' \\
                        '--recursive[Scan recursively]' \\
                        '--report[Report format]:report:(console json html markdown)' \\
                        '--detailed[Show detailed metrics]' \\
                        '--export[Export path]:file:_files' \\
                        '--threshold[Health threshold]' \\
                        '--dry-run[No side effects]'
                    ;;
                quickstart)
                    _arguments \\
                        '--demo[Interactive demo]' \\
                        '--interactive[Setup wizard]' \\
                        '--sample[Sample dataset]' \\
                        '--output[Output path]:file:_files' \\
                        '--format[Output format]:format:(json yaml table)' \\
                        '--dry-run[Preview only]'
                    ;;
                completion)
                    if [[ $words[3] == '' ]]; then
                      _arguments '2:subcommand:(install generate)'
                    else
                      _arguments '3:shell:(bash zsh fish)'
                    fi
                    ;;
            esac
            ;;
    esac
}

_semantic_ds
`;
  }

  generateFishCompletion(): string {
    return `# Fish completion for semantic-ds

# Commands
complete -c semantic-ds -f -n '__fish_use_subcommand' -a 'init' -d 'Initialize a new semantic data science project'
complete -c semantic-ds -f -n '__fish_use_subcommand' -a 'infer' -d 'Run semantic inference on data files'
complete -c semantic-ds -f -n '__fish_use_subcommand' -a 'health' -d 'Check semantic coverage and system health'
complete -c semantic-ds -f -n '__fish_use_subcommand' -a 'validate' -d 'Validate semantic mappings and data consistency'
complete -c semantic-ds -f -n '__fish_use_subcommand' -a 'quickstart' -d 'Quick start demo and setup'
complete -c semantic-ds -f -n '__fish_use_subcommand' -a 'completion' -d 'Manage shell tab completion'

# Global options
complete -c semantic-ds -l help -d 'Show help information'
complete -c semantic-ds -l version -d 'Show version information'
complete -c semantic-ds -l verbose -d 'Verbose output'
complete -c semantic-ds -l quiet -d 'Quiet output'

# Init command options
complete -c semantic-ds -n '__fish_seen_subcommand_from init' -l template -d 'Project template' -xa 'basic advanced quickstart enterprise'
complete -c semantic-ds -n '__fish_seen_subcommand_from init' -l force -d 'Force initialization'
complete -c semantic-ds -n '__fish_seen_subcommand_from init' -l interactive -d 'Interactive setup'
complete -c semantic-ds -n '__fish_seen_subcommand_from init' -l dry-run -d 'Preview without writing'

# Infer command options
complete -c semantic-ds -n '__fish_seen_subcommand_from infer' -l output -d 'Output file' -F
complete -c semantic-ds -n '__fish_seen_subcommand_from infer' -l confidence -d 'Confidence threshold' -xa '0.5 0.7 0.8 0.9'
complete -c semantic-ds -n '__fish_seen_subcommand_from infer' -l format -d 'Output format' -xa 'json yaml table csv'
complete -c semantic-ds -n '__fish_seen_subcommand_from infer' -l dry-run -d 'Preview only'

# File completions for infer
complete -c semantic-ds -n '__fish_seen_subcommand_from infer' -a '(find . -name "*.csv" -o -name "*.json" -o -name "*.parquet" 2>/dev/null)'

# Health options
complete -c semantic-ds -n '__fish_seen_subcommand_from health' -l path -d 'Directory' -F
complete -c semantic-ds -n '__fish_seen_subcommand_from health' -l recursive -d 'Recursive'
complete -c semantic-ds -n '__fish_seen_subcommand_from health' -l report -d 'Report format' -xa 'console json html markdown'
complete -c semantic-ds -n '__fish_seen_subcommand_from health' -l detailed -d 'Detailed metrics'
complete -c semantic-ds -n '__fish_seen_subcommand_from health' -l export -d 'Export path' -F
complete -c semantic-ds -n '__fish_seen_subcommand_from health' -l threshold -d 'Threshold'
complete -c semantic-ds -n '__fish_seen_subcommand_from health' -l dry-run -d 'Preview only'

# Quickstart options
complete -c semantic-ds -n '__fish_seen_subcommand_from quickstart' -l demo -d 'Interactive demo'
complete -c semantic-ds -n '__fish_seen_subcommand_from quickstart' -l interactive -d 'Setup wizard'
complete -c semantic-ds -n '__fish_seen_subcommand_from quickstart' -l sample -d 'Sample dataset'
complete -c semantic-ds -n '__fish_seen_subcommand_from quickstart' -l output -d 'Output file' -F
complete -c semantic-ds -n '__fish_seen_subcommand_from quickstart' -l format -d 'Output format' -xa 'json yaml table'
complete -c semantic-ds -n '__fish_seen_subcommand_from quickstart' -l dry-run -d 'Preview only'

# Completion subcommands
complete -c semantic-ds -n '__fish_seen_subcommand_from completion' -a 'install generate'
complete -c semantic-ds -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
`;
  }

  async installCompletion(shell: 'bash' | 'zsh' | 'fish'): Promise<void> {
    let completionScript: string;
    let installPath: string;

    const homeDir = process.env.HOME || process.cwd();

    switch (shell) {
      case 'bash':
        completionScript = this.generateBashCompletion();
        installPath = path.join(homeDir, '.semantic-ds-completion.bash');
        break;
      case 'zsh':
        completionScript = this.generateZshCompletion();
        installPath = path.join(homeDir, '.zsh', 'completions', '_semantic-ds');
        break;
      case 'fish':
        completionScript = this.generateFishCompletion();
        installPath = path.join(homeDir, '.config', 'fish', 'completions', 'semantic-ds.fish');
        break;
      default:
        throw new Error(`Unsupported shell: ${shell}`);
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(installPath), { recursive: true });

    // Write completion script
    await fs.writeFile(installPath, completionScript, 'utf-8');

    console.log(chalk.green(`✅ Tab completion installed for ${shell}`));
    console.log(chalk.gray(`   Location: ${installPath}`));

    // Show activation instructions
    this.showActivationInstructions(shell, installPath);
  }

  private showActivationInstructions(shell: string, installPath: string): void {
    console.log(chalk.cyan('\n📋 Activation Instructions:'));

    switch (shell) {
      case 'bash':
        console.log(chalk.white('   Add this line to your ~/.bashrc or ~/.bash_profile:'));
        console.log(chalk.yellow(`   source ${installPath}`));
        break;
      case 'zsh':
        console.log(chalk.white('   Ensure your ~/.zshrc includes:'));
        console.log(chalk.yellow('   fpath=(~/.zsh/completions $fpath)'));
        console.log(chalk.yellow('   autoload -U compinit && compinit'));
        break;
      case 'fish':
        console.log(chalk.white('   Fish will automatically load the completion.'));
        console.log(chalk.white('   Restart your shell or run:'));
        console.log(chalk.yellow('   source ~/.config/fish/config.fish'));
        break;
    }

    console.log(chalk.gray('\n💡 Then restart your shell or open a new terminal.'));
  }
}

// Export for CLI integration
export async function handleCompletionRequest(line: string, point: string): Promise<void> {
  const engine = new TabCompletionEngine();
  const result = await engine.complete(line, parseInt(point, 10));

  // Output completions for shell consumption
  console.log(result.completions.join(' '));
}
