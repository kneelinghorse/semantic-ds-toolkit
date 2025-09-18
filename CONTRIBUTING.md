# Contributing to Semantic Data Science Toolkit

Thanks for your interest in contributing! We welcome issues, PRs, docs, and examples.

## Getting Started
- Fork and clone the repo
- Install Node 18+: `nvm use 18`
- Install deps: `npm ci`
- Build: `npm run build`
- Run tests: `npm test`

## Development Guidelines
- Use TypeScript and keep types strict
- Follow Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- Add tests for new features and bug fixes
- Keep PRs focused and small when possible

## Running the CLI locally
```bash
npm run build
node dist/cli/index.js --help
```

## Release Process
- We use semantic versioning (semver)
- Maintainers cut releases by tagging `vX.Y.Z` and publishing to npm
- Changelog is generated from PRs and commit messages

## Code of Conduct
Be respectful and inclusive. Harassment or discrimination is not tolerated.
