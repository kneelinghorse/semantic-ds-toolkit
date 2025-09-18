jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});

jest.mock('ora', () => ({ __esModule: true, default: () => ({ start: () => ({ succeed() {}, fail() {}, stop() {}, text: '' }) }) }));
jest.mock('inquirer', () => ({ __esModule: true, prompt: jest.fn(() => Promise.resolve({})) }));

describe('CLI: enhanced-cli completion generate', () => {
  let logSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('prints bash completion script', () => {
    process.argv = ['node', 'semantic-ds', 'completion', 'generate', 'bash'];
    jest.isolateModules(() => {
      require('../../src/cli/enhanced-cli');
    });
    const out = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? '')).join('\n');
    expect(out).toContain('complete -F');
  });

  it('prints zsh completion script', () => {
    process.argv = ['node', 'semantic-ds', 'completion', 'generate', 'zsh'];
    jest.isolateModules(() => {
      require('../../src/cli/enhanced-cli');
    });
    const out = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? '')).join('\n');
    expect(out).toContain('#compdef semantic-ds');
  });
});

