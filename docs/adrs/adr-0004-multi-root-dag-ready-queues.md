# ADR-0004: Multi-Root DAG-Ready Queues

## Status

- Proposed -> Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

The original queue package assumes a flat FIFO-ready stream. New GPU workloads
need dependency chains, join points, and multiple roots while preserving
lock-free scheduling and per-core worker throughput.

## Decision

Add a second WGSL scheduler asset, `dag-queue.wgsl`, alongside the original flat
queue.

- Keep `queue.wgsl` for existing flat consumers.
- Add priority-aware ready lanes in `dag-queue.wgsl`.
- Represent unresolved dependency counts and dependent lists explicitly.
- Publish roots through `enqueue_main`.
- Unlock downstream jobs through `complete_job(...)` when a worker finishes.
- Add JS helpers that normalize DAG metadata before it is uploaded to GPU
  buffers, including root detection, dependent lists, and priority-lane
  summaries.

## Consequences

- Positive: the package now supports flat and DAG scheduling without forcing a
  breaking migration.
- Positive: workers can keep a single completion hook across queue modes.
- Negative: DAG consumers need more buffers and initialization logic than the
  flat queue path.

## Alternatives Considered

- Replace the flat queue entirely: Rejected because current packages already use
  it.
- Push DAG logic into `@plasius/gpu-worker` only: Rejected because the queue
  package owns scheduling primitives and WGSL buffer contracts.
