jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});
jest.mock('ora', () => {
  const spinner = { succeed: () => {}, fail: () => {}, stop: () => {}, text: '' } as any;
  const factory = (_text?: string) => ({ ...spinner, start: () => spinner });
  return { __esModule: true, default: factory };
});

import { ProgressReporter, InferenceProgressReporter, HealthCheckProgressReporter } from '../../src/cli/progress-reporter';

describe('CLI: ProgressReporter', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('runs inference steps and completes with summary', async () => {
    const pr = new InferenceProgressReporter({ showTimer: true, emoji: false });
    pr.start('Test Inference');
    await pr.loadData(async () => ({ ok: true }));
    await pr.analyzePatterns(async () => ({ ok: true }));
    await pr.runInference(async () => ({ ok: true }));
    await pr.validateResults(async () => ({ ok: true }));
    await pr.saveResults(async () => ({ ok: true }));
    pr.complete('Done');
    expect(logSpy).toHaveBeenCalled();
  });

  it('supports compact sub-progress creation', () => {
    const pr = new ProgressReporter({ compact: false });
    pr.addSteps([{ id: 'a', text: 'A' }]);
    pr.start('Main');
    const sub = pr.createSubProgress('a');
    expect(sub).toBeInstanceOf(ProgressReporter);
  });

  it('health reporter covers steps', async () => {
    const pr = new HealthCheckProgressReporter({ showTimer: false });
    pr.start('Health');
    await pr.runWithProgress('scan', 'Scanning', async () => ({}));
    await pr.runWithProgress('coverage', 'Coverage', async () => ({}));
    pr.complete('Health done');
    expect(logSpy).toHaveBeenCalled();
  });
});

