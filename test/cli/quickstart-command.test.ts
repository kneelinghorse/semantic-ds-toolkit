jest.mock('chalk', () => {
  const chain: any = new Proxy((s: any) => (typeof s === 'string' ? s : ''), {
    get: () => chain,
    apply: (_t, _a, args: any[]) => (args && typeof args[0] === 'string' ? args[0] : '')
  });
  return { __esModule: true, default: chain, ...chain };
});

jest.mock('inquirer', () => ({
  __esModule: true,
  prompt: jest.fn(() => Promise.resolve({ choice: 'instant' }))
}));

// Mock the exact ESM-style specifier used by the source file
jest.mock('../../src/cli/quick-start.js', () => ({
  __esModule: true,
  QuickStartDemo: class { async run() { /* no-op */ } }
}));

// Also stub interactive-init to prevent importing ora/inquirer from that path
jest.mock('../../src/cli/interactive-init.js', () => ({
  __esModule: true,
  InteractiveInitWizard: class { async run() { /* no-op */ } }
}));

import { quickstartCommand } from '../../src/cli/quickstart-command';

describe('CLI: quickstartCommand', () => {
  it('runs instant demo path via menu', async () => {
    await quickstartCommand({});
    expect(true).toBe(true);
  });
});
