# AGENTS

## Purpose
This repo provides a minimal WebGPU lock-free MPMC ring queue (WGSL) with a small JS helper for loading the shader, plus a demo and tests.

## Key paths
- `src/queue.wgsl`: lock-free queue implementation
- `src/index.js`: package entry point for loading WGSL
- `demo/index.html`: demo shell
- `demo/main.js`: WebGPU setup and queue usage demo
- `tests/`: unit, package, and e2e tests

## Commands
- Demo: `python3 -m http.server` then open `http://localhost:8000/demo`
- Unit tests: `npm run test:unit`
- Coverage: `npm run test:coverage`
- E2E: `npm run test:e2e` (installs Playwright Chromium on first run; requires network)

## Development notes
- No build step; plain JS + WGSL.
- Keep WGSL buffer layouts explicit and aligned; document queue invariant changes.
- Prefer clarity over cleverness in JS and WGSL.
- Avoid breaking public API; update `README.md` and `CHANGELOG.md` for user-facing changes.
- Follow `SECURITY.md` for vulnerability reporting.
- Contributions require a CLA (see `legal/CLA.md`).

## Conventions
- Use Conventional Commits (see `CONTRIBUTING.md`).
- Keep changes focused and add/update tests when behavior changes.
- Architectural changes require ADRs in `docs/adrs/` (or the repo ADRs folder); ensure a package-function ADR exists.

## AI guidance
- After any change, run relevant BDD/TDD tests when they exist; mention if skipped.
- For fixes, add/update a BDD or TDD test that fails first and validate it passes after the fix when possible.
- When adding or updating dependencies, prefer lazy-loading (dynamic import/code splitting) to avoid heavy first-load network use when applicable.


## Release and Quality Policy
- Update `README.md` whenever structural changes are made.
- Update `CHANGELOG.md` after every change.
- For fixes, add tests and run relevant tests before committing.
- Publish packages to npm only through GitHub CD workflows; do not publish directly from local machines.
- Maintain code coverage at 80% or higher where possible. Shader-related code is exempt.


## Plasius Package Creation Reference
- Use `/Users/philliphounslow/plasius/schema` (`@plasius/schema`) as the baseline template when creating new `@plasius/*` packages.
- Copy template runtime/tooling files at project creation: `.nvmrc` and `.npmrc`.
- Create and maintain required package docs from the start:
  - `README.md`: initialize for package purpose/API and update whenever structure or public behavior changes.
  - `CHANGELOG.md`: initialize at creation and update after every change.
  - `AGENTS.md`: include package-specific guidance and keep this policy section present.
- Include required legal/compliance files and folders used by the template/repo standards:
  - `LICENSE`
  - `SECURITY.md`
  - `CONTRIBUTING.md`
  - `legal/` documents (including CLA-related files where applicable)
- Include architecture/design documentation requirements:
  - ADRs in `docs/adrs/` for architectural decisions.
  - TDRs for technical decisions/direction.
  - Design documents for significant implementation plans and system behavior.
- Testing requirements for new packages and ongoing changes:
  - Define test scripts/strategy at creation time.
  - Create tests for all fixes and run relevant tests before committing.
  - Maintain code coverage at 80%+ where possible; shader-related code is the only coverage exception.
