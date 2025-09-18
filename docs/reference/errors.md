# Error Codes & Recovery

The CLI includes intelligent error handling with automated suggestions. Common categories:

## File Not Found
- Pattern: missing `semantic-config.yaml`
- Fixes:
  - Run `semantic-ds init --interactive`
  - Or generate a basic config automatically when prompted

## Permission Denied
- Check file/directory permissions
- Consider running with appropriate privileges

## Missing Dependencies
- Run `npm install` in your project
- If issues persist, clear cache: `npm cache clean --force && npm install`

## Invalid YAML
- Validate your YAML syntax
- The CLI will attempt to back up and guide fixes

## Network Issues
- Work offline where possible (the CLI supports a cached/offline mode)

## Validation Errors
- Review `--strict` usage and lower thresholds if appropriate
- Use `--dry-run` first to preview issues

See also the CLI’s contextual suggestions on failures.

