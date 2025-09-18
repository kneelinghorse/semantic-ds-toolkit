import chalk from 'chalk';

export interface OutputTheme {
  primary: typeof chalk;
  secondary: typeof chalk;
  success: typeof chalk;
  warning: typeof chalk;
  error: typeof chalk;
  info: typeof chalk;
  muted: typeof chalk;
  highlight: typeof chalk;
  accent: typeof chalk;
}

export const themes: Record<string, OutputTheme> = {
  default: {
    primary: chalk.blue,
    secondary: chalk.cyan,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    info: chalk.blue,
    muted: chalk.gray,
    highlight: chalk.white.bold,
    accent: chalk.magenta
  },
  dark: {
    primary: chalk.blueBright,
    secondary: chalk.cyanBright,
    success: chalk.greenBright,
    warning: chalk.yellowBright,
    error: chalk.redBright,
    info: chalk.blueBright,
    muted: chalk.gray,
    highlight: chalk.whiteBright.bold,
    accent: chalk.magentaBright
  },
  minimal: {
    primary: chalk.white,
    secondary: chalk.gray,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    info: chalk.white,
    muted: chalk.gray,
    highlight: chalk.white.bold,
    accent: chalk.white
  }
};

export class OutputFormatter {
  private theme: OutputTheme;
  private useEmoji: boolean;
  private useColor: boolean;

  constructor(themeName: string = 'default', options: { emoji?: boolean; color?: boolean } = {}) {
    this.theme = themes[themeName] || themes.default;
    this.useEmoji = options.emoji !== false;
    this.useColor = options.color !== false;

    // Disable colors if NO_COLOR environment variable is set
    if (process.env.NO_COLOR) {
      this.useColor = false;
    }
  }

  // Status indicators with optional emoji
  success(text: string, emoji: string = '✅'): string {
    const icon = this.useEmoji ? `${emoji} ` : '';
    const styled = this.useColor ? this.theme.success(text) : text;
    return `${icon}${styled}`;
  }

  error(text: string, emoji: string = '❌'): string {
    const icon = this.useEmoji ? `${emoji} ` : '';
    const styled = this.useColor ? this.theme.error(text) : text;
    return `${icon}${styled}`;
  }

  warning(text: string, emoji: string = '⚠️'): string {
    const icon = this.useEmoji ? `${emoji} ` : '';
    const styled = this.useColor ? this.theme.warning(text) : text;
    return `${icon}${styled}`;
  }

  info(text: string, emoji: string = 'ℹ️'): string {
    const icon = this.useEmoji ? `${emoji} ` : '';
    const styled = this.useColor ? this.theme.info(text) : text;
    return `${icon}${styled}`;
  }

  // Semantic formatting
  title(text: string, emoji: string = '🚀'): string {
    const icon = this.useEmoji ? `${emoji} ` : '';
    const styled = this.useColor ? this.theme.primary.bold(text) : text;
    return `${icon}${styled}`;
  }

  subtitle(text: string): string {
    return this.useColor ? this.theme.secondary(text) : text;
  }

  highlight(text: string): string {
    return this.useColor ? this.theme.highlight(text) : text;
  }

  muted(text: string): string {
    return this.useColor ? this.theme.muted(text) : text;
  }

  accent(text: string): string {
    return this.useColor ? this.theme.accent(text) : text;
  }

  // Command/code formatting
  command(text: string): string {
    const styled = this.useColor ? this.theme.accent(text) : text;
    return this.useEmoji ? `$ ${styled}` : styled;
  }

  code(text: string): string {
    return this.useColor ? chalk.bgGray.black(` ${text} `) : `\`${text}\``;
  }

  path(text: string): string {
    return this.useColor ? this.theme.info(text) : text;
  }

  // Data formatting
  table(headers: string[], rows: string[][]): string {
    if (!this.useColor) {
      return this.formatPlainTable(headers, rows);
    }

    const headerRow = headers.map(h => this.theme.highlight(h)).join(' │ ');
    const separator = '─'.repeat(headerRow.length);

    const dataRows = rows.map(row =>
      row.map((cell, i) => {
        if (i === 0) return this.theme.primary(cell);
        if (cell.match(/^\d+(\.\d+)?$/)) return this.theme.accent(cell);
        if (cell.match(/^(true|false)$/i)) return this.theme.secondary(cell);
        return cell;
      }).join(' │ ')
    );

    return [
      headerRow,
      separator,
      ...dataRows
    ].join('\n');
  }

  private formatPlainTable(headers: string[], rows: string[][]): string {
    const allRows = [headers, ...rows];
    const columnWidths = headers.map((_, i) =>
      Math.max(...allRows.map(row => (row[i] || '').length))
    );

    const formatRow = (row: string[]) =>
      row.map((cell, i) => (cell || '').padEnd(columnWidths[i])).join(' | ');

    return [
      formatRow(headers),
      columnWidths.map(w => '-'.repeat(w)).join('-+-'),
      ...rows.map(formatRow)
    ].join('\n');
  }

  // Progress indicators
  progress(current: number, total: number, label?: string): string {
    const percentage = Math.round((current / total) * 100);
    const bar = this.createProgressBar(percentage);
    const stats = `${current}/${total} (${percentage}%)`;
    const labelText = label ? ` ${label}` : '';

    return `${bar} ${this.muted(stats)}${labelText}`;
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    if (this.useEmoji) {
      return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
    } else {
      return `[${'#'.repeat(filled)}${'.'.repeat(empty)}]`;
    }
  }

  // List formatting
  bulletList(items: string[], bullet: string = '•'): string {
    const bulletChar = this.useEmoji ? bullet : '-';
    return items.map(item => `  ${this.muted(bulletChar)} ${item}`).join('\n');
  }

  numberedList(items: string[]): string {
    return items.map((item, i) => `  ${this.muted(`${i + 1}.`)} ${item}`).join('\n');
  }

  // Semantic data science specific formatting
  confidence(score: number): string {
    const percentage = Math.round(score * 100);
    let color = this.theme.muted;
    let emoji = '⚪';

    if (score >= 0.9) {
      color = this.theme.success;
      emoji = '🟢';
    } else if (score >= 0.8) {
      color = this.theme.warning;
      emoji = '🟡';
    } else if (score >= 0.7) {
      color = this.theme.error;
      emoji = '🟠';
    } else {
      color = this.theme.error;
      emoji = '🔴';
    }

    const styled = this.useColor ? color(`${percentage}%`) : `${percentage}%`;
    return this.useEmoji ? `${emoji} ${styled}` : styled;
  }

  semanticType(type: string): string {
    const typeColors: Record<string, typeof chalk> = {
      identifier: this.theme.primary,
      email: this.theme.info,
      phone: this.theme.accent,
      address: this.theme.secondary,
      timestamp: this.theme.warning,
      currency: this.theme.success,
      percentage: this.theme.warning,
      url: this.theme.info,
      category: this.theme.accent,
      description: this.theme.muted
    };

    const color = typeColors[type.toLowerCase()] || this.theme.muted;
    return this.useColor ? color(type) : type;
  }

  timeSaved(amount: string): string {
    const emoji = this.useEmoji ? '⚡ ' : '';
    const styled = this.useColor ? this.theme.success.bold(amount) : amount;
    return `${emoji}${styled}`;
  }

  // Box drawing
  box(content: string, title?: string, style: 'single' | 'double' | 'rounded' = 'single'): string {
    const lines = content.split('\n');
    const maxWidth = Math.max(...lines.map(line => line.length));
    const width = Math.max(maxWidth, title?.length || 0) + 4;

    const chars = this.getBoxChars(style);

    let result = [];

    // Top border
    if (title) {
      const titlePadding = Math.max(0, width - title.length - 4);
      const leftPad = Math.floor(titlePadding / 2);
      const rightPad = titlePadding - leftPad;
      result.push(chars.topLeft + chars.horizontal.repeat(leftPad + 1) + ` ${title} ` + chars.horizontal.repeat(rightPad + 1) + chars.topRight);
    } else {
      result.push(chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight);
    }

    // Content
    lines.forEach(line => {
      const padding = width - line.length - 4;
      result.push(chars.vertical + ` ${line}${' '.repeat(padding)} ` + chars.vertical);
    });

    // Bottom border
    result.push(chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight);

    return result.join('\n');
  }

  private getBoxChars(style: 'single' | 'double' | 'rounded') {
    const styles = {
      single: {
        topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
        horizontal: '─', vertical: '│'
      },
      double: {
        topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝',
        horizontal: '═', vertical: '║'
      },
      rounded: {
        topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯',
        horizontal: '─', vertical: '│'
      }
    };
    return styles[style];
  }

  // Utility methods
  dim(text: string): string {
    return this.useColor ? chalk.dim(text) : text;
  }

  bold(text: string): string {
    return this.useColor ? chalk.bold(text) : text;
  }

  underline(text: string): string {
    return this.useColor ? chalk.underline(text) : text;
  }

  strikethrough(text: string): string {
    return this.useColor ? chalk.strikethrough(text) : text;
  }

  // Output methods
  print(text: string): void {
    console.log(text);
  }

  printSuccess(text: string, emoji?: string): void {
    console.log(this.success(text, emoji));
  }

  printError(text: string, emoji?: string): void {
    console.error(this.error(text, emoji));
  }

  printWarning(text: string, emoji?: string): void {
    console.log(this.warning(text, emoji));
  }

  printInfo(text: string, emoji?: string): void {
    console.log(this.info(text, emoji));
  }

  printTitle(text: string, emoji?: string): void {
    console.log(this.title(text, emoji));
  }

  printBox(content: string, title?: string, style?: 'single' | 'double' | 'rounded'): void {
    console.log(this.box(content, title, style));
  }
}

// Export default formatter instance
export const output = new OutputFormatter();

// Utility functions for quick access
export const format = {
  success: (text: string, emoji?: string) => output.success(text, emoji),
  error: (text: string, emoji?: string) => output.error(text, emoji),
  warning: (text: string, emoji?: string) => output.warning(text, emoji),
  info: (text: string, emoji?: string) => output.info(text, emoji),
  title: (text: string, emoji?: string) => output.title(text, emoji),
  subtitle: (text: string) => output.subtitle(text),
  highlight: (text: string) => output.highlight(text),
  muted: (text: string) => output.muted(text),
  command: (text: string) => output.command(text),
  code: (text: string) => output.code(text),
  path: (text: string) => output.path(text),
  confidence: (score: number) => output.confidence(score),
  semanticType: (type: string) => output.semanticType(type),
  timeSaved: (amount: string) => output.timeSaved(amount)
};

export default OutputFormatter;