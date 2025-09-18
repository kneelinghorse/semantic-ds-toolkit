# Quality Monitoring How-to

This guide shows how to monitor data quality and semantic coverage.

## Quick checks

Run a health scan:
```bash
semantic-ds health --report console --detailed
```

## Continuous monitoring

Lightweight monitoring loop:
```bash
semantic-ds monitor --interval 5s
```

## Alerts and thresholds

Use `semantic-config.yaml` to configure drift thresholds and alert channels. See `docs/reference/configuration.md`.

