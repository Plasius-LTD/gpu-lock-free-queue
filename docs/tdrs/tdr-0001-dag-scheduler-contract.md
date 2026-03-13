# TDR-0001: DAG Scheduler Contract

- Status: Accepted
- Date: 2026-03-13

## Context

The queue package needs a contract that can express multiple roots, dependency
fan-in, and priority-aware ready work while keeping the existing flat queue
asset intact.

## Decision

Use two scheduler modes:

- `flat`: existing ring queue behavior
- `dag`: dependency-aware ready queues with downstream unlocks

The JS helper surface will validate and normalize DAG metadata before a caller
builds buffers for the DAG scheduler asset.

## Implementation Notes

- `createDagJobGraph(...)` validates ids, dependencies, and cycles.
- `createDagJobGraph(...)` also derives roots, dependents, dependency counts,
  and `priorityLanes` so callers can upload multi-root ready queues without
  reinventing graph normalization.
- `loadSchedulerWgsl({ mode })` selects flat or DAG assets.
- `complete_job(...)` exists in both modes so worker code can target a shared
  completion lifecycle.

## Consequences

- Positive: worker and manifest packages can evolve toward DAG scheduling
  without breaking flat consumers.
- Negative: the queue package now owns two WGSL assets that must stay coherent.
