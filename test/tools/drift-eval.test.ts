describe('Tools: drift-eval (smoke)', () => {
  it('runs and logs KS sanity and summary', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.isolateModules(() => {
      require('../../src/tools/drift-eval');
    });
    await new Promise(r => setTimeout(r, 0));
    const out = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? '')).join('\n');
    expect(out).toContain('KS sanity:');
    expect(out).toContain('Drift eval summary:');
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});

