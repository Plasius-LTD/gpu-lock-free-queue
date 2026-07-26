# ADR-0005: Schema-Driven WGSL Qualification

- Status: Accepted
- Date: 2026-07-26
- Feature flag: `asset.pipeline.shader-store.enabled`

## Context

This repository contains three WGSL assets: the published flat queue, the
legacy demo queue, and the DAG queue. A compilation smoke test for only one
file could not detect orphan shaders, CPU/GPU layout drift, incomplete entry
point coverage, pipeline-layout errors, or semantic failures after dispatch.

Queue records are consumed by CPU packers and GPU pipelines. Maintaining those
layouts independently would allow the two representations to disagree.

## Decision

Final assembled WGSL is the source of truth for GPU-facing records, offsets,
alignment, bindings, entry points, and ABI hashes.

The package uses `@plasius/gpu-shader` to generate immutable qualification
contracts under `qualification/`. Each repository WGSL asset has its own
compile unit with:

- exact source and module digests;
- reflected GPU interface and model ABI hashes;
- explicit compute entry points, pipeline layouts, and bind groups;
- bounded binary fixtures generated through reflected CPU codecs;
- enqueue and dequeue dispatches with semantic readback; and
- the exact stable-WebGPU matrix cells required for promotion.

`shader:contracts` regenerates the expected contracts in memory and fails if
checked-in output is stale, an entry point is omitted, a fixture is invalid, or
any WGSL file under `src/` or `demo/` is not assigned to a compile unit.

CI requires Chromium SwiftShader without skips for deterministic feedback.
Chromium is launched with explicit Vulkan, SwiftShader Vulkan, and
`--use-webgpu-adapter=swiftshader` selection. The qualification test verifies
those effective browser arguments through the DevTools protocol and requires
the selected WebGPU adapter to expose its fallback-adapter marker before the
result can pass.
`shader:evidence` separately admits only complete, digest-bound, passing
evidence for the flat, demo, and DAG bundles across every declared physical
matrix cell. Missing runners, skips, timeouts, device loss, or stale evidence
remain release blockers.

## Consequences

- Shader edits must run `npm run shader:generate` and commit the regenerated
  contracts.
- CPU fixture bytes cannot be maintained from caller-supplied offsets.
- Published artifacts carry qualification manifests alongside the WGSL.
- The physical matrix cannot be manufactured by a local development machine;
  promotion waits for evidence from qualified runners.
- The additional generated files increase repository and package size, but
  make release admission reproducible and fail closed.
