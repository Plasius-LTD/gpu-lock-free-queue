struct Queue {
  head: atomic<u32>,
  tail: atomic<u32>,
  capacity: u32,
  mask: u32,
  _pad: vec2<u32>,
};

struct Slot {
  seq: atomic<u32>,
  value: u32,
  _pad: vec2<u32>,
};

struct Params {
  job_count: u32,
  _pad: vec3<u32>,
};

@group(0) @binding(0) var<storage, read_write> queue: Queue;
@group(0) @binding(1) var<storage, read_write> slots: array<Slot>;
@group(0) @binding(2) var<storage, read> input_jobs: array<u32>;
@group(0) @binding(3) var<storage, read_write> output_jobs: array<u32>;
@group(0) @binding(4) var<storage, read_write> status: array<u32>;
@group(0) @binding(5) var<uniform> params: Params;

const MAX_RETRIES: u32 = 512u;

fn enqueue(val: u32) -> u32 {
  for (var attempt: u32 = 0u; attempt < MAX_RETRIES; attempt++) {
    let t = atomicLoad(&queue.tail);
    let slot_index = t & queue.mask;
    let seq = atomicLoad(&slots[slot_index].seq);
    let diff = i32(seq) - i32(t);

    if (diff == 0) {
      let res = atomicCompareExchangeWeak(&queue.tail, t, t + 1u);
      if (res.exchanged) {
        slots[slot_index].value = val;
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
  for (var attempt: u32 = 0u; attempt < MAX_RETRIES; attempt++) {
    let h = atomicLoad(&queue.head);
    let slot_index = h & queue.mask;
    let seq = atomicLoad(&slots[slot_index].seq);
    let diff = i32(seq) - i32(h + 1u);

    if (diff == 0) {
      let res = atomicCompareExchangeWeak(&queue.head, h, h + 1u);
      if (res.exchanged) {
        let val = slots[slot_index].value;
        output_jobs[idx] = val;
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
  if (idx >= params.job_count) {
    return;
  }
  if (status[idx] == 1u) {
    return;
  }

  let ok = enqueue(input_jobs[idx]);
  if (ok == 1u) {
    status[idx] = 1u;
  }
}

@compute @workgroup_size(64)
fn dequeue_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.job_count) {
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
