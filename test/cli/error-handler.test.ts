jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});
import { EnhancedErrorHandler } from '../../src/cli/error-handler';

describe('CLI: EnhancedErrorHandler', () => {
  const originalExit = process.exit;
  beforeEach(() => {
    // @ts-ignore
    process.exit = jest.fn();
  });
  afterEach(() => {
    process.exit = originalExit;
  });

  it('suggests actions for missing config file', async () => {
    const handler = new EnhancedErrorHandler('infer', ['data.csv'] as any);
    const err = new Error('ENOENT: no such file or directory, open "semantic-config.yaml"');
    await handler.handleError(err);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
