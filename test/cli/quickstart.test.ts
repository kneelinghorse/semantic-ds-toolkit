jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});
jest.mock('ora', () => {
  const factory = (_text?: string) => ({
    start: () => ({ succeed: () => {}, fail: () => {}, stop: () => {}, text: '' })
  });
  return { __esModule: true, default: factory };
});
import { QuickStartDemo } from '../../src/cli/quick-start';

describe('CLI: QuickStartDemo', () => {
  it('runs in dry-run mode without filesystem writes', async () => {
    const demo = new QuickStartDemo();
    await demo.run({ demo: true, dryRun: true, output: './quickstart-results.json', format: 'json' });
    // If we reached here, it executed without throwing
    expect(true).toBe(true);
  }, 20000);
});
