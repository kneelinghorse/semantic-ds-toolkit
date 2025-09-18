jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});

// Avoid ESM runtime issues from transitive imports
jest.mock('ora', () => ({ __esModule: true, default: () => ({ start: () => ({ succeed() {}, fail() {}, stop() {}, text: '' }) }) }));
jest.mock('inquirer', () => ({ __esModule: true, prompt: jest.fn(() => Promise.resolve({})) }));

describe('CLI: enhanced-cli help & parsing', () => {
  let exitSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('prints banner when run without args', () => {
    process.argv = ['node', 'semantic-ds'];
    jest.isolateModules(() => {
      require('../../src/cli/enhanced-cli');
    });
    expect(logSpy).toHaveBeenCalled();
  });

  it('handles --help without error', () => {
    process.argv = ['node', 'semantic-ds', '--help'];
    jest.isolateModules(() => {
      require('../../src/cli/enhanced-cli');
    });
    // Commander writes help to stdout directly; just ensure no error exit
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('exits with code 1 on invalid command', () => {
    process.argv = ['node', 'semantic-ds', 'not-a-command'];
    jest.isolateModules(() => {
      require('../../src/cli/enhanced-cli');
    });
    expect(errSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
