module.exports = {
  rootDir: '../../',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/e2e/simple-e2e.test.ts'
  ],
  collectCoverageFrom: [
    '<rootDir>/src/core/**/*.ts',
    '<rootDir>/src/inference/**/*.ts',
    '<rootDir>/src/matchers/**/*.ts',
    '<rootDir>/src/normalizers/**/*.ts',
    '<rootDir>/src/operators/**/*.ts',
    '<rootDir>/src/registry/**/*.ts',
    '!<rootDir>/src/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 60000, // 60 seconds for E2E tests
  setupFilesAfterEnv: ['<rootDir>/test/e2e/setup.ts']
};
