struct ReadyQueue {
  head: atomic<u32>,
  tail: atomic<u32>,
  capacity: u32,
  mask: u32,
};

struct ReadySlot {
  seq: atomic<u32>,
  node_index: u32,
  _pad0: u32,
  _pad1: u32,
};

struct JobNode {
  job_type: u32,
  priority: u32,
  payload_offset: u32,
  payload_words: u32,
  dependency_offset: u32,
  dependency_count: u32,
  dependent_offset: u32,
  dependent_count: u32,
};

struct JobState {
  unresolved: atomic<u32>,
  state: atomic<u32>,
  _pad: vec2<u32>,
};

struct JobDesc {
  node_index: u32,
  job_type: u32,
  priority: u32,
  payload_offset: u32,
  payload_words: u32,
  _pad: vec3<u32>,
};

struct Params {
  job_count: u32,
  output_stride: u32,
  ready_queue_count: u32,
  max_priority: u32,
};

@group(0) @binding(0) var<storage, read_write> ready_queues: array<ReadyQueue>;
@group(0) @binding(1) var<storage, read_write> ready_slots: array<ReadySlot>;
@group(0) @binding(2) var<storage, read> job_nodes: array<JobNode>;
@group(0) @binding(3) var<storage, read_write> job_states: array<JobState>;
@group(0) @binding(4) var<storage, read> job_dependents: array<u32>;
@group(0) @binding(5) var<storage, read_write> output_jobs: array<JobDesc>;
@group(0) @binding(6) var<storage, read> input_payloads: array<u32>;
@group(0) @binding(7) var<storage, read_write> output_payloads: array<u32>;
@group(0) @binding(8) var<storage, read_write> status: array<u32>;
@group(0) @binding(9) var<uniform> params: Params;

const MAX_RETRIES: u32 = 512u;

fn queue_config_valid() -> bool {
  if (params.ready_queue_count == 0u) {
    return false;
  }
  if (params.ready_queue_count > arrayLength(&ready_queues)) {
    return false;
  }
  for (var i: u32 = 0u; i < params.ready_queue_count; i = i + 1u) {
    let queue = ready_queues[i];
    if (queue.capacity == 0u) {
      return false;
    }
    if ((queue.capacity & (queue.capacity - 1u)) != 0u) {
      return false;
    }
    if (queue.mask != queue.capacity - 1u) {
      return false;
    }
  }
  return true;
}

fn enqueue_job_count() -> u32 {
  return min(params.job_count, arrayLength(&job_nodes));
}

fn dequeue_job_count() -> u32 {
  if (params.output_stride == 0u) {
    return 0u;
  }
  let payload_jobs = arrayLength(&output_payloads) / params.output_stride;
  var count = min(params.job_count, arrayLength(&output_jobs));
  count = min(count, payload_jobs);
  return min(count, arrayLength(&status));
}

fn queue_len() -> u32 {
  var total: u32 = 0u;
  for (var i: u32 = 0u; i < params.ready_queue_count; i = i + 1u) {
    let h = atomicLoad(&ready_queues[i].head);
    let t = atomicLoad(&ready_queues[i].tail);
    total = total + (t - h);
  }
  return total;
}

fn ready_queue_index(priority: u32) -> u32 {
  if (params.ready_queue_count == 0u) {
    return 0u;
  }
  return min(priority, params.ready_queue_count - 1u);
}

fn slot_base(queue_index: u32) -> u32 {
  var offset: u32 = 0u;
  for (var i: u32 = 0u; i < queue_index; i = i + 1u) {
    offset = offset + ready_queues[i].capacity;
  }
  return offset;
}

fn enqueue_ready(queue_index: u32, node_index: u32) -> u32 {
  let queue = ready_queues[queue_index];
  let base = slot_base(queue_index);
  for (var attempt: u32 = 0u; attempt < MAX_RETRIES; attempt = attempt + 1u) {
    let t = atomicLoad(&ready_queues[queue_index].tail);
    let local_slot = t & queue.mask;
    let slot_index = base + local_slot;
    let seq = atomicLoad(&ready_slots[slot_index].seq);
    let diff = i32(seq) - i32(t);

    if (diff == 0) {
      let res = atomicCompareExchangeWeak(&ready_queues[queue_index].tail, t, t + 1u);
      if (res.exchanged) {
        ready_slots[slot_index].node_index = node_index;
        atomicStore(&ready_slots[slot_index].seq, t + 1u);
        return 1u;
      }
    } else if (diff < 0) {
      return 0u;
    }
  }

  return 0u;
}

fn dequeue_ready(output_index: u32) -> u32 {
  for (var priority_step: u32 = 0u; priority_step < params.ready_queue_count; priority_step = priority_step + 1u) {
    let queue_index = params.ready_queue_count - 1u - priority_step;
    let queue = ready_queues[queue_index];
    let base = slot_base(queue_index);

    for (var attempt: u32 = 0u; attempt < MAX_RETRIES; attempt = attempt + 1u) {
      let h = atomicLoad(&ready_queues[queue_index].head);
      let local_slot = h & queue.mask;
      let slot_index = base + local_slot;
      let seq = atomicLoad(&ready_slots[slot_index].seq);
      let diff = i32(seq) - i32(h + 1u);

      if (diff == 0) {
        let res = atomicCompareExchangeWeak(&ready_queues[queue_index].head, h, h + 1u);
        if (res.exchanged) {
          let node_index = ready_slots[slot_index].node_index;
          let node = job_nodes[node_index];
          let dst_base = output_index * params.output_stride;
          let copy_words = min(node.payload_words, params.output_stride);
          for (var i: u32 = 0u; i < copy_words; i = i + 1u) {
            output_payloads[dst_base + i] = input_payloads[node.payload_offset + i];
          }
          for (var i: u32 = copy_words; i < params.output_stride; i = i + 1u) {
            output_payloads[dst_base + i] = 0u;
          }
          output_jobs[output_index].node_index = node_index;
          output_jobs[output_index].job_type = node.job_type;
          output_jobs[output_index].priority = node.priority;
          output_jobs[output_index].payload_offset = node.payload_offset;
          output_jobs[output_index].payload_words = node.payload_words;
          output_jobs[output_index]._pad = vec3<u32>(0u, 0u, 0u);
          atomicStore(&ready_slots[slot_index].seq, h + queue.capacity);
          return 1u;
        }
      } else if (diff < 0) {
        break;
      }
    }
  }

  return 0u;
}

fn initialize_node(node_index: u32) {
  let node = job_nodes[node_index];
  let dep_count = node.dependency_count;
  let ready_state = select(1u, 2u, dep_count == 0u);
  let init = atomicCompareExchangeWeak(&job_states[node_index].state, 0u, ready_state);
  if (!init.exchanged) {
    return;
  }

  atomicStore(&job_states[node_index].unresolved, dep_count);
  if (dep_count == 0u) {
    _ = enqueue_ready(ready_queue_index(node.priority), node_index);
  }
}

fn complete_job(output_index: u32) {
  let node_index = output_jobs[output_index].node_index;
  let completed = atomicCompareExchangeWeak(&job_states[node_index].state, 2u, 3u);
  if (!completed.exchanged) {
    return;
  }

  let node = job_nodes[node_index];
  for (var i: u32 = 0u; i < node.dependent_count; i = i + 1u) {
    let dependent_index = job_dependents[node.dependent_offset + i];
    let previous = atomicSub(&job_states[dependent_index].unresolved, 1u);
    if (previous == 1u) {
      let ready = atomicCompareExchangeWeak(&job_states[dependent_index].state, 1u, 2u);
      if (ready.exchanged) {
        let dependent = job_nodes[dependent_index];
        _ = enqueue_ready(
          ready_queue_index(dependent.priority),
          dependent_index
        );
      }
    }
  }
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

  initialize_node(idx);
  status[idx] = 1u;
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

  let ok = dequeue_ready(idx);
  if (ok == 1u) {
    status[idx] = 1u;
  }
}
