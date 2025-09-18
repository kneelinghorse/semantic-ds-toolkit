jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});
import { OutputFormatter, format } from '../../src/cli/output-formatter';

describe('CLI: OutputFormatter', () => {
  it('formats success, error, warning, info with and without emoji/color', () => {
    const fmt = new OutputFormatter('default', { emoji: true, color: false });
    expect(fmt.success('ok')).toContain('✅');
    expect(fmt.error('boom')).toContain('❌');
    expect(fmt.warning('care')).toContain('⚠️');
    expect(fmt.info('info')).toContain('ℹ️');

    const noEmoji = new OutputFormatter('minimal', { emoji: false, color: false });
    expect(noEmoji.success('ok')).toBe('ok');
    expect(noEmoji.command('cmd')).toBe('cmd');
  });

  it('renders tables, progress bars and boxes', () => {
    const fmt = new OutputFormatter('default', { emoji: false, color: false });
    const table = fmt.table(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(table).toContain('A | B');
    const progress = fmt.progress(5, 10, 'half');
    expect(progress).toContain('5/10');
    const box = fmt.box('content', 'Title', 'rounded');
    expect(box).toContain('Title');
  });

  it('formats semantic utilities', () => {
    const fmt = new OutputFormatter('default', { emoji: false, color: false });
    expect(fmt.confidence(0.95)).toContain('95');
    expect(fmt.semanticType('email')).toContain('email');
    expect(fmt.timeSaved('4.2 hours')).toContain('4.2');
  });

  it('provides shortcut helpers', () => {
    expect(format.success('ok')).toBeTruthy();
    expect(format.error('err')).toBeTruthy();
    expect(format.highlight('x')).toBeTruthy();
  });
});
