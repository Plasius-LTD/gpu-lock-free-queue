struct Queue {
  head: atomic<u32>,
  tail: atomic<u32>,
  capacity: u32,
  mask: u32,
  payload_stride: u32,
  _pad: array<u32, 3>,
};

struct Slot {
  seq: atomic<u32>,
  payload_words: u32,
  _pad: vec2<u32>,
};

struct Params {
  job_count: u32,
  _pad: vec3<u32>,
};

@group(0) @binding(0) var<storage, read_write> queue: Queue;
@group(0) @binding(1) var<storage, read_write> slots: array<Slot>;
@group(0) @binding(2) var<storage, read_write> payload_ring: array<u32>;
@group(0) @binding(3) var<storage, read> input_payloads: array<u32>;
@group(0) @binding(4) var<storage, read_write> output_payloads: array<u32>;
@group(0) @binding(5) var<storage, read_write> status: array<u32>;
@group(0) @binding(6) var<uniform> params: Params;

const MAX_RETRIES: u32 = 512u;

fn queue_config_valid() -> bool {
  if (queue.capacity == 0u) {
    return false;
  }
  if ((queue.capacity & (queue.capacity - 1u)) != 0u) {
    return false;
  }
  if (queue.mask != queue.capacity - 1u) {
    return false;
  }
  if (queue.capacity > arrayLength(&slots)) {
    return false;
  }
  if (queue.payload_stride == 0u) {
    return false;
  }
  let payload_capacity = arrayLength(&payload_ring) / queue.payload_stride;
  if (queue.capacity > payload_capacity) {
    return false;
  }
  return true;
}

fn enqueue_job_count() -> u32 {
  let payload_stride = queue.payload_stride;
  if (payload_stride == 0u) {
    return 0u;
  }
  let payload_jobs = arrayLength(&input_payloads) / payload_stride;
  let count = min(params.job_count, payload_jobs);
  return min(count, arrayLength(&status));
}

fn dequeue_job_count() -> u32 {
  let payload_stride = queue.payload_stride;
  if (payload_stride == 0u) {
    return 0u;
  }
  let payload_jobs = arrayLength(&output_payloads) / payload_stride;
  let count = min(params.job_count, payload_jobs);
  return min(count, arrayLength(&status));
}

fn enqueue(idx: u32) -> u32 {
  let payload_stride = queue.payload_stride;
  for (var attempt: u32 = 0u; attempt < MAX_RETRIES; attempt++) {
    let t = atomicLoad(&queue.tail);
    let slot_index = t & queue.mask;
    let seq = atomicLoad(&slots[slot_index].seq);
    let diff = i32(seq) - i32(t);

    if (diff == 0) {
      let res = atomicCompareExchangeWeak(&queue.tail, t, t + 1u);
      if (res.exchanged) {
        let src_base = idx * payload_stride;
        let dst_base = slot_index * payload_stride;
        for (var i: u32 = 0u; i < payload_stride; i = i + 1u) {
          payload_ring[dst_base + i] = input_payloads[src_base + i];
        }
        slots[slot_index].payload_words = payload_stride;
        atomicStore(&slots[slot_index].seq, t + 1u);
        return 1u;
      }
    } else if (diff < 0) {
      return 0u;
    }
  }

  return 0u;
}

fn dequeue(idx: u32) -> u32 {
  let payload_stride = queue.payload_stride;
  for (var attempt: u32 = 0u; attempt < MAX_RETRIES; attempt++) {
    let h = atomicLoad(&queue.head);
    let slot_index = h & queue.mask;
    let seq = atomicLoad(&slots[slot_index].seq);
    let diff = i32(seq) - i32(h + 1u);

    if (diff == 0) {
      let res = atomicCompareExchangeWeak(&queue.head, h, h + 1u);
      if (res.exchanged) {
        let src_base = slot_index * payload_stride;
        let dst_base = idx * payload_stride;
        let payload_words = slots[slot_index].payload_words;
        let copy_words = min(payload_words, payload_stride);
        for (var i: u32 = 0u; i < copy_words; i = i + 1u) {
          output_payloads[dst_base + i] = payload_ring[src_base + i];
        }
        for (var i: u32 = copy_words; i < payload_stride; i = i + 1u) {
          output_payloads[dst_base + i] = 0u;
        }
        atomicStore(&slots[slot_index].seq, h + queue.capacity);
        return 1u;
      }
    } else if (diff < 0) {
      return 0u;
    }
  }

  return 0u;
}

@compute @workgroup_size(64)
fn enqueue_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let job_count = enqueue_job_count();
  if (idx >= job_count) {
    return;
  }
  if (!queue_config_valid()) {
    return;
  }
  if (status[idx] == 1u) {
    return;
  }

  let ok = enqueue(idx);
  if (ok == 1u) {
    status[idx] = 1u;
  }
}

@compute @workgroup_size(64)
fn dequeue_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let job_count = dequeue_job_count();
  if (idx >= job_count) {
    return;
  }
  if (!queue_config_valid()) {
    return;
  }
  if (status[idx] == 1u) {
    return;
  }

  let ok = dequeue(idx);
  if (ok == 1u) {
    status[idx] = 1u;
  }
}
