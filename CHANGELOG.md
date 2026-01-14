# Changelog

All notable changes to this project will be documented in this file.

The format is based on **[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)**, and this project adheres to **[Semantic Versioning](https://semver.org/spec/v2.0.0.html)**.

---

## [Unreleased]

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

- **Fixed**
  - WGSL entry points now validate queue configuration and clamp job counts to buffer lengths.
  - WGSL load errors now surface with explicit HTTP status details.

- **Security**
  - None.

## [0.1.0] - 2025-01-08

- **Added**
  - WebGPU lock-free MPMC queue with sequence counters.
  - Demo for enqueue/dequeue, FFT spectrogram, and randomness heuristics.

[0.1.0]: https://github.com/Plasius-LTD/gpu-lock-free-queue/releases/tag/v0.1.0
