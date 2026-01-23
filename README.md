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
- Fixed-size payloads stored in a dedicated payload ring buffer; enqueue copies input payloads into the ring and dequeue copies them out to keep payload lifetimes robust.

## Buffer layout (breaking change in v0.2.0)
Bindings are:
1. `@binding(0)` queue header: `{ head, tail, capacity, mask, payload_stride }`
2. `@binding(1)` slot sequence array (`Slot`)
3. `@binding(2)` payload ring buffer (`array<u32>`, length `capacity * payload_stride`)
4. `@binding(3)` input payloads (`array<u32>`, length `job_count * payload_stride`)
5. `@binding(4)` output payloads (`array<u32>`, length `job_count * payload_stride`)
6. `@binding(5)` status flags (`array<u32>`, length `job_count`)
7. `@binding(6)` params (`Params` with `job_count`)

`payload_stride` is measured in 32-bit words and must be greater than zero.

## Limitations
- Sequence counters are 32-bit. At extreme throughput over a long time, counters wrap and ABA can reappear. If you need true long-running safety, consider a reset protocol, sharding, or a future 64-bit atomic extension.
- Payloads are fixed-size and capacity must be power-of-two.
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

## Payload shape
Payloads are fixed-size chunks of `payload_stride` `u32` words. If you need `f32`, store `bitcast<u32>(value)` and reinterpret on the consumer side. For larger or variable-length payloads, enqueue an index + length into a separate payload arena.
