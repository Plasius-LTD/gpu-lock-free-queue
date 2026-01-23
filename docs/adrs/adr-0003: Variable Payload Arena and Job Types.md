# ADR-0003: Variable Payload Arena and Job Types

## Status

- Proposed -> Accepted
- Date: 2026-01-23
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

The queue must support variable-size payloads and multiple job types while keeping enqueue/dequeue fast and lock-free. Fixed-stride payloads limit flexibility and waste bandwidth for smaller jobs. We also need a standard job type field to enable per-type scheduling downstream.

## Decision

We will extend the queue with a variable-size payload arena and job metadata:

- Add a payload arena ring with its own head/tail/mask in the queue header.
- Store `job_type`, `payload_offset`, and `payload_words` per slot.
- Enqueue allocates variable-sized space from the payload arena (atomic tail advance), copies payload words into the arena, then publishes the slot.
- Dequeue reads `payload_offset` and `payload_words` to copy out the payload and advances the payload arena head in strict FIFO order.
- Enqueue ordering is important: payload reclamation assumes dequeue order aligns with enqueue order.
- Add a queue length helper for best-effort backlog snapshots used by schedulers.

## Consequences

- **Positive:** Supports true variable payload sizes and per-type scheduling without changing the queue API per workload.
- **Negative:** Adds allocator complexity and additional atomics for payload arena management.
- **Neutral:** Payload arena behavior is FIFO and depends on enqueue/dequeue ordering for safe reclamation.

## ABA Safety

- **Slot ABA:** The queue keeps per-slot sequence counters; ABA safety is preserved within the 32-bit epoch, as in the original design.
- **Payload ABA:** The payload arena is safe only if reclaimed in strict FIFO order. Reusing payload space out of order risks ABA on payload offsets. Therefore, payload head advances must align with dequeue order.

## Alternatives Considered

- **Fixed-stride payloads only:** Rejected due to wasted bandwidth and limited flexibility.
- **Per-job dynamic allocations:** Rejected due to fragmentation and non-deterministic lifetime handling.
- **Multiple queues per job type:** Rejected for now to keep a single queue integration path.
