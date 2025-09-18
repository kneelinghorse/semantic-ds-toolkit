export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.ts'
  ],
  // Allow TS to resolve ESM-style .js specifiers in source during tests
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Exclude internal perf/bench/optimization demo code from coverage
    '!src/optimization/**',
    '!src/benchmarks/**',
    '!src/operators/semantic-join-examples.ts',
    '!src/drift/drift-detection.example.ts',
    // Exclude any test files living under src (some integration samples live there)
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
