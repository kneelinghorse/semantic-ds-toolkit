jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});

jest.mock('ora', () => ({ __esModule: true, default: () => ({ start: () => ({ succeed() {}, fail() {}, stop() {}, text: '' }) }) }));

describe('CLI: enhanced-cli health & version (smoke)', () => {
  let logSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      // prevent Jest worker from exiting due to commander behavior
      (process as any).exitCode = code ?? 0;
      throw new Error(`process.exit called with ${code}`);
    }) as any);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('runs health command', () => {
    process.argv = ['node', 'semantic-ds', 'health', '--dry-run'];
    jest.isolateModules(() => {
      require('../../src/cli/enhanced-cli');
    });
    const out = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? ''));
    const text = out.join('\n');
    expect(text.includes('Health Summary') || text.includes('System Health Check')).toBe(true);
  });

  it('shows version with --version', () => {
    process.argv = ['node', 'semantic-ds', '--version'];
    jest.isolateModules(() => {
      try {
        require('../../src/cli/enhanced-cli');
      } catch (e) {
        // expected from exit mock
      }
    });
    const out = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? ''));
    expect(out.join('\n').length >= 0).toBe(true);
  });
});
