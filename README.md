# 🚀 Semantic Data Science Toolkit

[![npm version](https://img.shields.io/npm/v/%40semantic-ds%2Ftoolkit.svg)](https://www.npmjs.com/package/@semantic-ds/toolkit)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Build Status](https://github.com/kneelinghorse/semantic-ds-toolkit/workflows/CI/badge.svg)](https://github.com/kneelinghorse/semantic-ds-toolkit/actions)

Stop breaking pipelines when schemas change. The Semantic Data Science Toolkit introduces Stable Column Anchors (SCAs) that survive renames, reordering, and schema evolution.

## ✨ Key Features

- Stable Column Anchors: Schema resilience by design
- Intelligent Inference: 85%+ accuracy on automatic semantic detection
- Federated CID Registry: No central coordination required
- Performance-First: 1M+ rows/second processing
- SQL Generation: Export to Snowflake, BigQuery, DuckDB, and more

## 🎯 Quick Start (< 5 minutes)

```bash
npm install -g @semantic-ds/toolkit

# Run interactive quickstart
semantic-ds quickstart

# Or jump straight in
semantic-ds infer data.csv
semantic-ds generate-sql --target snowflake
```

## API Overview

- Core Anchors: `StableColumnAnchorSystem` (fingerprinting, reconciliation)
- Persistence: YAML store under `./semantics/anchors/`
- CLI: `semantic-ds` with `init`, `infer`, `health`, `validate`

## Develop

```bash
npm ci
npm run build
npm test
```

## License

Apache License 2.0. See LICENSE for details.
