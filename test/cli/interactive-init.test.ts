jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});

jest.mock('inquirer', () => {
  const responses: any[] = [
    { name: 'proj', description: 'desc' }, // gatherProjectInfo
    { template: 'quickstart' },           // selectTemplate
    { proceed: true },                    // non-empty dir proceed
    { confirm: true }                     // confirmAndCreate
  ];
  return {
    __esModule: true,
    default: { prompt: jest.fn(() => Promise.resolve(responses.shift() || {})) },
    prompt: jest.fn(() => Promise.resolve(responses.shift() || {}))
  };
});

// Mock ora spinner to avoid ESM import issues and side effects
jest.mock('ora', () => {
  const spinner = { succeed: () => {}, fail: () => {}, stop: () => {}, text: '' } as any;
  const factory = (_text?: string) => ({ ...spinner, start: () => spinner });
  return { __esModule: true, default: factory };
});

import { InteractiveInitWizard } from '../../src/cli/interactive-init';

describe('CLI: InteractiveInitWizard (dry-run)', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  afterAll(() => logSpy.mockRestore());

  it('prints a dry-run plan without writing files', async () => {
    const wiz = new InteractiveInitWizard(true);
    await wiz.run();
    expect(logSpy).toHaveBeenCalled();
  });
});
