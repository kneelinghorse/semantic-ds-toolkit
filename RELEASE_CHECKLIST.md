# Pre-release Checklist

```ts
const RELEASE_CHECKLIST = {
  code: {
    tests: "All passing",
    coverage: ">90%",
    linting: "No errors",
    types: "Fully typed"
  },
  documentation: {
    README: "Compelling with examples",
    API: "Complete reference",
    tutorials: "10+ examples",
    changelog: "Updated"
  },
  legal: {
    LICENSE: "Apache 2.0",
    headers: "License headers on all files",
    dependencies: "License compatible"
  },
  github: {
    tags: "v0.1.0",
    release_notes: "Detailed changelog",
    binaries: "Optional pre-built CLI"
  }
}
```

## Commands

```bash
npm run build
npm test
npm pack --dry-run  # Inspect contents

npm login
npm publish --access public

git tag -a v0.1.0 -m "Initial release"
git push origin v0.1.0
```
