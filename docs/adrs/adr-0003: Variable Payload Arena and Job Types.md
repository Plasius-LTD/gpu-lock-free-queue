# ADR-0003: Payload Handles and Job Types

## Status

- Proposed -> Accepted
- Date: 2026-01-23
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

The queue must support variable-size payloads and multiple job types while keeping enqueue/dequeue fast and lock-free. We need payload flexibility without introducing allocator contention or deadlocks, and a standard job type field to enable per-type scheduling downstream.

## Decision

We will keep fixed-size job metadata and use payload handles (offsets) into caller-managed buffers:

- Store `job_type`, `payload_offset`, and `payload_words` per slot.
- Enqueue validates payload bounds and publishes the slot without allocating payload storage.
- Dequeue mirrors job metadata into `output_jobs` and optionally copies payload data from `input_payloads` into `output_payloads`.
- Payload lifetime is managed outside the queue (frame-bounded arenas or generation handles are recommended).
- Add a queue length helper for best-effort backlog snapshots used by schedulers.

## Consequences

- **Positive:** Variable payload sizes and per-type scheduling without allocator contention inside the queue.
- **Negative:** Payload lifetime becomes the caller's responsibility; requires external arena or reclamation policy.
- **Neutral:** The queue only transports handles/metadata; payload copying is optional.

## ABA Safety

- **Slot ABA:** The queue keeps per-slot sequence counters; ABA safety is preserved within the 32-bit epoch, as in the original design.
- **Payload ABA:** Payload reuse safety is handled outside the queue. Use generation-tagged handles or frame-bounded arenas to avoid stale references.

## Alternatives Considered

- **Inline payload arena with variable allocation:** Rejected due to allocator contention and FIFO ordering constraints.
- **Shared/weak pointer semantics:** Rejected due to high atomic overhead and complex control blocks on GPU.
- **Multiple queues per job type:** Rejected for now to keep a single queue integration path.
