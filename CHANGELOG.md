# Changelog

All notable changes to this project will be documented in this file.

The format is based on **[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)**, and this project adheres to **[Semantic Versioning](https://semver.org/spec/v2.0.0.html)**.

---

## [Unreleased]

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.2] - 2026-02-28

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.1] - 2026-01-23

- **Changed**
  - **Breaking:** Queue payloads are now referenced by fixed metadata offsets into caller-managed payload buffers (no internal payload arena).
  - **Breaking:** Queue header and bindings updated to remove payload arena fields and buffer.
  - Demo and tests updated to reflect the new payload-handle layout.
  - **Breaking:** Queue header now includes payload arena head/tail and capacity/mask fields.
  - Queue helpers now expose a `queue_len` backlog snapshot for schedulers.
  - Demo and tests updated to use job metadata and variable payload copies.

- **Fixed**
  - Payload allocations now validate arena capacity before enqueue.

## [0.2.0] - 2026-01-23

- **Changed**
  - **Breaking:** WGSL bindings now include a dedicated payload ring buffer plus input/output payload buffers.
  - Queue headers now carry `payload_stride` (u32 words) and job payloads are copied into the ring on enqueue.
  - Demo and tests updated to use payload buffers instead of `input_jobs`/`output_jobs`.

- **Fixed**
  - Payload job counts now clamp to payload buffer lengths to prevent overruns.

## [0.1.2] - 2026-01-22

- **Added**
  - Deterministic demo test pattern mode for stable image hashing in e2e tests.
  - 4x4 demo grid for multi-canvas output.
  - Timestamped demo logging.
  - Demo FPS counter and per-image progress indicators.
  - Loader and WGSL guard tests, plus an e2e WGSL compilation check.

- **Changed**
  - `loadQueueWgsl` accepts `url`/`fetcher` overrides and falls back to filesystem reads for `file:` URLs.
  - Demo renders 500 interleaved static frames using per-image queues per frame.
  - Demo updates canvases line-by-line for progressive static output.
  - Build outputs now ship as ESM and CJS bundles with the WGSL asset in `dist/`.

- **Fixed**
  - WGSL entry points now validate queue configuration and clamp job counts to buffer lengths.
  - WGSL load errors now surface with explicit HTTP status details.
  - CD build now installs TypeScript for the tsup build step.

- **Security**
  - None.

## [0.1.0] - 2025-01-08

- **Added**
  - WebGPU lock-free MPMC queue with sequence counters.
  - Demo for enqueue/dequeue, FFT spectrogram, and randomness heuristics.

[0.1.0]: https://github.com/Plasius-LTD/gpu-lock-free-queue/releases/tag/v0.1.0
[0.1.2]: https://github.com/Plasius-LTD/gpu-lock-free-queue/releases/tag/v0.1.2
[0.2.0]: https://github.com/Plasius-LTD/gpu-lock-free-queue/releases/tag/v0.2.0
[0.2.1]: https://github.com/Plasius-LTD/gpu-lock-free-queue/releases/tag/v0.2.1

## [0.2.1] - 2026-02-11

- **Added**
  - Initial release.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)
[0.2.2]: https://github.com/Plasius-LTD/gpu-lock-free-queue/releases/tag/v0.2.2
