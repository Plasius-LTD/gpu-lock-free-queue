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
