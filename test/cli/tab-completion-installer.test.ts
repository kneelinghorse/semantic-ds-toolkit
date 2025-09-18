jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});

jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    mkdir: jest.fn(async () => {}),
    writeFile: jest.fn(async () => {})
  }
}));

import { CompletionInstaller } from '../../src/cli/tab-completion';
import fs from 'fs/promises';

describe('CLI: CompletionInstaller', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  afterAll(() => logSpy.mockRestore());

  it('installs bash completion by writing a file', async () => {
    const installer = new CompletionInstaller();
    await installer.installCompletion('bash');
    expect((fs as any).mkdir).toHaveBeenCalled();
    expect((fs as any).writeFile).toHaveBeenCalled();
  });

  it('installs zsh completion and prints activation instructions', async () => {
    const installer = new CompletionInstaller();
    await installer.installCompletion('zsh');
    expect((fs as any).mkdir).toHaveBeenCalled();
    expect((fs as any).writeFile).toHaveBeenCalled();
    const calls = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? ''));
    expect(calls.some((s: string) => s.includes('fpath=('))).toBe(true);
    expect(calls.some((s: string) => s.includes('compinit'))).toBe(true);
  });

  it('installs fish completion and prints activation message', async () => {
    const installer = new CompletionInstaller();
    await installer.installCompletion('fish');
    expect((fs as any).mkdir).toHaveBeenCalled();
    expect((fs as any).writeFile).toHaveBeenCalled();
    const calls = (logSpy as any).mock.calls.map((c: any[]) => String(c[0] ?? ''));
    expect(calls.some((s: string) => s.includes('Fish will automatically load'))).toBe(true);
  });
});
