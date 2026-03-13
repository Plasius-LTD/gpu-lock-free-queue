# DAG Scheduler Design

## Overview

`@plasius/gpu-lock-free-queue` now exposes two queue assets:

- `queue.wgsl` for flat lock-free scheduling
- `dag-queue.wgsl` for dependency-aware scheduling

## DAG Model

Each DAG job node carries:

- `priority`
- payload metadata
- dependency count
- offsets into a dependent list

Each runtime job state carries:

- unresolved dependency counter
- scheduling state (`uninitialized`, `pending`, `ready/running`, `completed`)

## Execution Flow

1. `enqueue_main` initializes nodes and publishes every root job into a
   priority-mapped ready queue.
2. `dequeue_main` lets workers pop the highest-priority runnable job first.
3. Worker code calls `complete_job(...)` after processing.
4. `complete_job(...)` decrements unresolved counts on downstream jobs.
5. Any downstream job that reaches zero unresolved dependencies is atomically
   pushed into the appropriate ready queue.

## Compatibility

The flat queue asset now also exports `complete_job(...)`, but it is a no-op.
That allows worker code to use one completion hook regardless of scheduler mode.
