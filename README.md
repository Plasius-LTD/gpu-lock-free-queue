# @plasius/gpu-lock-free-queue

[![npm version](https://img.shields.io/npm/v/@plasius/gpu-lock-free-queue.svg)](https://www.npmjs.com/package/@plasius/gpu-lock-free-queue)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/gpu-lock-free-queue/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/gpu-lock-free-queue/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/gpu-lock-free-queue)](https://codecov.io/gh/Plasius-LTD/gpu-lock-free-queue)
[![License](https://img.shields.io/github/license/Plasius-LTD/gpu-lock-free-queue)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

[![CI](https://github.com/Plasius-LTD/gpu-lock-free-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/Plasius-LTD/gpu-lock-free-queue/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@plasius/gpu-lock-free-queue)](./LICENSE)

A WebGPU lock-free queue package that now ships both a flat MPMC ring queue and
a DAG-ready scheduler asset with dependency-aware ready lanes.

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

```js
import {
  createDagJobGraph,
  loadDagQueueWgsl,
  loadSchedulerWgsl,
} from "@plasius/gpu-lock-free-queue";

const graph = createDagJobGraph([
  { id: "g-buffer", priority: 4 },
  { id: "shadow", priority: 3 },
  { id: "lighting", dependencies: ["g-buffer", "shadow"], priority: 2 },
]);

console.log(graph.roots);
console.log(graph.priorityLanes);
const dagSchedulerWgsl = await loadDagQueueWgsl();
const selectedWgsl = await loadSchedulerWgsl({ mode: graph.mode });
```

## What this is
- Lock-free multi-producer, multi-consumer ring queue on the GPU.
- Multi-root DAG-ready scheduler asset with priority-aware ready queues.
- Uses per-slot sequence numbers to avoid ABA for slots within a 32-bit epoch.
- Fixed-size job metadata with payload offsets into a caller-managed data arena or buffer.

## Scheduler assets

- `queue.wgsl`: flat lock-free ring queue, compatible with the original worker runtime.
- `dag-queue.wgsl`: dependency-aware scheduler asset with multi-root publishing,
  priority ready lanes, and downstream unlock hooks via `complete_job(...)`.

Both assets remain lock-free. Workers pop runnable jobs without blocking, and
DAG jobs unlock downstream work via atomics when their dependency count reaches
zero.

The JS graph helper is the canonical preflight contract for DAG metadata. It
returns:

- `jobIds` for stable upload order
- `roots` for the initial runnable set
- `topologicalOrder` for validation and planning
- `priorityLanes` so callers can size ready queues per priority bucket
- per-job `dependencies`, `dependents`, `dependencyCount`,
  `unresolvedDependencyCount`, and `dependentCount`

## Buffer layout (breaking change in v0.4.0)
Bindings are:
1. `@binding(0)` queue header: `{ head, tail, capacity, mask }`
2. `@binding(1)` slot array (`Slot` with `seq`, `job_type`, `payload_offset`, `payload_words`)
3. `@binding(2)` input jobs (`array<JobMeta>` with `job_type`, `payload_offset`, `payload_words`)
4. `@binding(3)` output jobs (`array<JobMeta>` with `job_type`, `payload_offset`, `payload_words`)
5. `@binding(4)` input payloads (`array<u32>`, payload data referenced by `input_jobs.payload_offset`)
6. `@binding(5)` output payloads (`array<u32>`, length `job_count * output_stride`)
7. `@binding(6)` status flags (`array<u32>`, length `job_count`)
8. `@binding(7)` params (`Params` with `job_count`, `output_stride`)

`output_stride` is the per-job output stride (u32 words) used when copying payloads into `output_payloads`.

## Limitations
- Sequence counters are 32-bit. At extreme throughput over a long time, counters wrap and ABA can reappear. If you need true long-running safety, consider a reset protocol, sharding, or a future 64-bit atomic extension.
- Payload lifetimes are managed by the caller. Ensure payload buffers remain valid until consumers finish, or use frame-bounded arenas/generation handles.
- The DAG scheduler asset introduces extra buffers for job state and dependency
  lists; callers still need to build/upload those buffers explicitly.

## Run the demo
Run the demo server from the package root:

```sh
cd gpu-lock-free-queue
npm run demo
```

Then open `http://localhost:8000/demo/`.

The demo mounts the shared `@plasius/gpu-shared` 3D harbor surface and uses the
queue package's DAG graph to drive visible scene behavior. Root jobs, priority
lanes, dependency joins, and stress-mode graph expansion all stay visible in
context while `@plasius/gpu-lock-free-queue` continues to own the scheduling
contract instead of a package-local 2D validation surface.

## Build Outputs

`npm run build` emits `dist/index.js`, `dist/index.cjs`, `dist/queue.wgsl`, and
`dist/dag-queue.wgsl`. It also copies the generated `qualification/` contracts
into `dist/qualification/` so the reflected interfaces, fixtures, and exact
shader digests travel with the immutable package artifact.

## Tests

```sh
npm run test:e2e:setup
npm run test:unit
npm run test:coverage
npm run shader:contracts
npm run test:e2e
REQUIRE_WEBGPU_VALIDATION=true REQUIRE_SWIFTSHADER_VALIDATION=true npm run test:wgsl
```

`npm run test:wgsl` is the blocking browser-runtime shader validation command
used by CI. It compiles `src/queue.wgsl`, `demo/queue.wgsl`, and
`src/dag-queue.wgsl` through `GPUShaderModule.getCompilationInfo()`, creates
their explicit pipeline and bind-group layouts, dispatches both entry points,
and verifies bounded semantic readback. It fails closed when the runner cannot
select SwiftShader or expose the required WebGPU validation path.

`npm run shader:contracts` reflects final WGSL through
`@plasius/gpu-shader` and rejects stale generated files, undeclared entry
points, incomplete fixtures, or any orphan `.wgsl` file under `src/` or
`demo/`. WGSL is the source of truth for record fields, offsets, alignment,
bindings, and ABI hashes; those values are not maintained in sidecar metadata.

Promotion additionally requires complete evidence for every cell in
`qualification/stable-webgpu-matrix.json`:

```sh
npm run shader:evidence -- \
  --flat /secure/evidence/flat.json \
  --demo /secure/evidence/demo.json \
  --dag /secure/evidence/dag.json
```

Missing files, matrix cells, skips, timeouts, device loss, stale hashes, or
non-passing results reject the evidence. Evidence files are produced by the
qualified physical runners and are not checked into this repository.

## Development Checks

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run shader:contracts
npm run build
npm run pack:check
```

## Files
- `demo/index.html`: Loads the demo.
- `demo/main.js`: Shared 3D harbor validation scene driven by DAG queue roots,
  priority lanes, and dependency joins.
- `demo/queue.wgsl`: Legacy demo queue shader retained as its own qualified
  compile unit.
- `src/queue.wgsl`: Flat lock-free queue implementation.
- `src/dag-queue.wgsl`: DAG-ready scheduler implementation.
- `src/index.js`: Package entry point for loading scheduler assets and normalizing DAG graphs.
- `qualification/`: Generated GPU interface manifests, compile units,
  semantic fixtures, module digests, and stable-WebGPU matrix policy.

## Architecture Docs

- `docs/adrs/adr-0004-multi-root-dag-ready-queues.md`
- `docs/adrs/adr-0005-schema-driven-wgsl-qualification.md`
- `docs/tdrs/tdr-0001-dag-scheduler-contract.md`
- `docs/design/dag-scheduler-design.md`

## Payload shape
Payloads are variable-length chunks stored in a caller-managed buffer. Each job specifies `job_type`, `payload_offset`, and `payload_words` in `input_jobs`; dequeue copies payloads from `input_payloads` into `output_payloads` using `output_stride` and mirrors the metadata into `output_jobs`. If you need `f32`, store `bitcast<u32>(value)` and reinterpret on the consumer side.

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. CI runs on approved
self-hosted runners. Release preparation and npm publication use GitHub-hosted
runners with Node.js 24.18.0 LTS. CD remains disabled until the npm trusted
publisher binding is verified and the legacy token fallback is removed.
<!-- END PLASIUS RELEASE INTEGRITY -->
