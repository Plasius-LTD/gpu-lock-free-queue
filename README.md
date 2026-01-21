# @plasius/gpu-lock-free-queue

[![npm version](https://img.shields.io/npm/v/@plasius/gpu-lock-free-queue)](https://www.npmjs.com/package/@plasius/gpu-lock-free-queue)
[![CI](https://github.com/Plasius-LTD/gpu-lock-free-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/Plasius-LTD/gpu-lock-free-queue/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@plasius/gpu-lock-free-queue)](./LICENSE)

A minimal WebGPU lock-free MPMC ring queue using a per-slot sequence counter (Vyukov-style). This is a starter implementation focused on correctness, robustness, and low overhead.

Apache-2.0. ESM + CJS builds. WGSL assets are published in `dist/`.

## Install
```
npm install @plasius/gpu-lock-free-queue
```

## Usage
```js
import { loadQueueWgsl, queueWgslUrl } from "@plasius/gpu-lock-free-queue";

const shaderCode = await loadQueueWgsl();
// Or, fetch the WGSL file directly:
// const shaderCode = await fetch(queueWgslUrl).then((res) => res.text());
```

## What this is
- Lock-free multi-producer, multi-consumer ring queue on the GPU.
- Uses per-slot sequence numbers to avoid ABA for slots within a 32-bit epoch.
- Fixed-size jobs (u32) for now; a "job" can be expanded to a fixed-size struct or an index into a separate payload buffer.

## Limitations
- Sequence counters are 32-bit. At extreme throughput over a long time, counters wrap and ABA can reappear. If you need true long-running safety, consider a reset protocol, sharding, or a future 64-bit atomic extension.
- Jobs are fixed-size and must be power-of-two capacity.
- This demo is intentionally minimal; it is not yet integrated with a scheduler or backpressure policy.

## Run the demo
WebGPU requires a secure context. Use a local server, for example:

```
python3 -m http.server
```

Then open `http://localhost:8000` and check the console/output.

## Build Outputs

`npm run build` emits `dist/index.js`, `dist/index.cjs`, and `dist/queue.wgsl`.

## Tests
```
npm run test:unit
npm run test:coverage
npm run test:e2e
```

## Files
- `demo/index.html`: Loads the demo.
- `demo/main.js`: WebGPU setup, enqueue/dequeue test, FFT spectrogram, and randomness heuristics.
- `src/queue.wgsl`: Lock-free queue implementation.
- `src/index.js`: Package entry point for loading the WGSL file.

## Job shape
Current jobs are `u32` values. If you need richer jobs, use a fixed-size struct (e.g., 16 bytes) or store indices into a separate payload buffer. Variable-length jobs should be modeled as an index + length into a payload arena to keep the queue fixed-size.
