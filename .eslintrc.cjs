module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    'prefer-const': 'warn',
    'no-var': 'error',
    'no-unused-vars': 'off',
    'no-undef': 'off',
    'no-case-declarations': 'off',
    'no-useless-escape': 'off',
  },
  env: {
    node: true,
    jest: true,
    es2020: true,
  },
};
