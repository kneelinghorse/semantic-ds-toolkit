jest.mock('fs', () => ({
  __esModule: true,
  promises: {
    mkdir: jest.fn(async () => {}),
    writeFile: jest.fn(async () => {}),
    readFile: jest.fn(async () => { throw new Error('no file'); })
  }
}));

describe('Tools: drift-monitor (smoke)', () => {
  it('runs and logs a summary without writing real files', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.isolateModules(() => {
      require('../../src/tools/drift-monitor');
    });
    // Give any pending microtasks a moment
    await new Promise(r => setTimeout(r, 0));
    const output = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? '')).join('\n');
    expect(output).toContain('Drift monitor summary:');
    expect(output).toContain('Saved:');
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});

