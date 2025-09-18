# Architecture Overview

Core components:
- Inference Engine: pattern + statistical analyzers
- Anchor Store: persistence/versioning of anchors
- Reconciler: match new data to existing anchors
- Normalizers: clean/standardize inputs for joins
- Drift Detection: monitor semantic/statistical drift

CLI flows:
- `quickstart`: end-to-end demo in minutes
- `init --interactive`: project scaffolding
- `infer`: semantic analysis with progress and reporting
- `health`: coverage/performance checks
- `validate`: mapping and data validation

