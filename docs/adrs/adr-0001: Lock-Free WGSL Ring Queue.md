# ADR-0001: Lock-Free WGSL Ring Queue

## Status

- Proposed -> Accepted
- Date: 2026-01-08
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

We need a minimal, low-overhead GPU queue that supports multi-producer / multi-consumer workloads in WebGPU. The queue must be robust enough for real-time job scheduling and be easy to embed in WGSL-based pipelines while keeping buffer layouts explicit and deterministic.

## Decision

We will implement a Vyukov-style MPMC ring queue in WGSL with the following structural choices:

- Use per-slot sequence counters (`atomic<u32>`) to avoid ABA within a 32-bit epoch.
- Require a power-of-two capacity and store `mask = capacity - 1` for fast indexing.
- Store fixed-size payloads in a dedicated payload ring buffer. Enqueue copies payloads into the ring, and dequeue copies them out to preserve payload lifetime.
- Expose a `payload_stride` (u32 words) in the queue header to describe payload size.
- Ship WGSL as a published asset and provide a small JS loader helper.
- Publish both ESM and CJS builds for broad compatibility.

## Consequences

- **Positive:** Lock-free GPU job scheduling with minimal overhead and deterministic buffer layouts. Payload lifetime is explicit and robust.
- **Negative:** Payloads must be fixed-size and capacity must be power-of-two; sequence counters can wrap under extreme uptime.
- **Neutral:** Variable-size payloads are supported indirectly via indices into a separate payload arena.

## Alternatives Considered

- **CPU-side scheduling only:** Rejected due to higher latency and CPU/GPU sync overhead.
- **Per-job dynamic allocations:** Rejected due to fragmentation and non-deterministic lifetime handling.
