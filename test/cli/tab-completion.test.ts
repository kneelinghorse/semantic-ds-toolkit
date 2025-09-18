jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});
import { TabCompletionEngine, CompletionInstaller } from '../../src/cli/tab-completion';

describe('CLI: TabCompletion', () => {
  it('completes commands and options', async () => {
    const engine = new TabCompletionEngine();
    const cmds = await engine.complete('', 0);
    expect(cmds.completions.length).toBeGreaterThan(0);

    const quick = await engine.complete('quick', 5);
    expect(quick.completions.some(c => c.startsWith('quickstart'))).toBe(true);

    const line = 'semantic-ds infer --f';
    const opts = await engine.complete(line, line.length);
    expect(opts.completions.some(c => c.startsWith('--format'))).toBe(true);
  });

  it('generates shell completion scripts', () => {
    const installer = new CompletionInstaller();
    const bash = installer.generateBashCompletion();
    const zsh = installer.generateZshCompletion();
    const fish = installer.generateFishCompletion();
    expect(bash).toContain('complete -F');
    expect(zsh).toContain('#compdef semantic-ds');
    expect(fish).toContain('Fish completion');
  });
});
