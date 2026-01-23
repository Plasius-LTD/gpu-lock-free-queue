# ADR-0002: Dual ESM and CJS Entrypoints

## Status

- Proposed -> Accepted
- Date: 2026-01-23
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

The package ships WGSL assets and exposes helpers that rely on module-relative URLs. `import.meta.url` works for ESM, but CJS builds do not support it, which breaks asset URL resolution and triggers build warnings or runtime failures.

## Decision

We will publish separate entrypoints for ESM and CJS:

- ESM stays in `src/index.js` and uses `import.meta.url`.
- CJS uses `src/index.cjs` and computes the WGSL URL from `__filename` via `pathToFileURL`.
- The build outputs remain dual-format (`dist/index.js` and `dist/index.cjs`).

## Consequences

- **Positive:** Reliable WGSL asset loading in both ESM and CJS environments; no build-time warnings for `import.meta` in CJS.
- **Negative:** Two entrypoints must be kept in sync.
- **Neutral:** Consumers can use either module format without changing usage patterns.

## Alternatives Considered

- **Define `import.meta.url` at build time for CJS:** Rejected because esbuild `define` does not allow runtime expressions.
- **Drop CJS output:** Rejected due to compatibility requirements for existing consumers.
