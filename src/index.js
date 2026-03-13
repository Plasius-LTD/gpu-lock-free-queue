export const queueWgslUrl = new URL("./queue.wgsl", import.meta.url);
export const dagQueueWgslUrl = new URL("./dag-queue.wgsl", import.meta.url);
export const schedulerModes = Object.freeze(["flat", "dag"]);

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

function assertSchedulerMode(mode) {
  const resolved = mode ?? "flat";
  if (!schedulerModes.includes(resolved)) {
    throw new Error(
      `mode must be one of: ${schedulerModes.join(", ")}.`
    );
  }
  return resolved;
}

function assertIdentifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `${name} must match ${IDENTIFIER_PATTERN.toString()} and be at most 64 characters long.`
    );
  }
  return value;
}

function readNonNegativeInteger(name, value) {
  if (value === undefined) {
    return 0;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    !Number.isFinite(value)
  ) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function normalizeDependencies(name, value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of dependency ids.`);
  }
  return [...new Set(value.map((entry, index) =>
    assertIdentifier(`${name}[${index}]`, entry)
  ))];
}

function resolveGraphJobId(job, index) {
  if (typeof job.id === "string") {
    return assertIdentifier(`jobs[${index}].id`, job.id);
  }
  if (typeof job.label === "string") {
    return assertIdentifier(`jobs[${index}].label`, job.label);
  }
  if (typeof job.key === "string") {
    return assertIdentifier(`jobs[${index}].key`, job.key);
  }
  if (typeof job.jobType === "string") {
    return assertIdentifier(`jobs[${index}].jobType`, job.jobType);
  }
  return assertIdentifier(`jobs[${index}].id`, `job-${index}`);
}

async function loadWgslAsset(assetUrl, options = {}) {
  const { url = assetUrl, fetcher = globalThis.fetch } = options ?? {};
  const wgslUrl = url instanceof URL ? url : new URL(url, assetUrl);

  if (!fetcher || wgslUrl.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return readFile(fileURLToPath(wgslUrl), "utf8");
  }

  const response = await fetcher(wgslUrl);
  if (!response.ok) {
    const status = "status" in response ? response.status : "unknown";
    const statusText = "statusText" in response ? response.statusText : "";
    const detail = statusText ? `${status} ${statusText}` : `${status}`;
    throw new Error(`Failed to load WGSL (${detail})`);
  }
  return response.text();
}

export async function loadQueueWgsl(options = {}) {
  return loadWgslAsset(queueWgslUrl, options);
}

export async function loadDagQueueWgsl(options = {}) {
  return loadWgslAsset(dagQueueWgslUrl, options);
}

export async function loadSchedulerWgsl(options = {}) {
  const { mode = "flat", ...rest } = options ?? {};
  const resolvedMode = assertSchedulerMode(mode);
  if (resolvedMode === "dag") {
    return loadDagQueueWgsl(rest);
  }
  return loadQueueWgsl(rest);
}

export function createDagJobGraph(jobs = []) {
  if (!Array.isArray(jobs)) {
    throw new Error("jobs must be an array.");
  }

  const normalized = jobs.map((job, index) => {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      throw new Error(`jobs[${index}] must be an object.`);
    }

    const id = resolveGraphJobId(job, index);
    const dependencies = normalizeDependencies(
      `jobs[${index}].dependencies`,
      job.dependencies ?? job.dependsOn
    );
    const priority = readNonNegativeInteger(
      `jobs[${index}].priority`,
      job.priority
    );

    return {
      id,
      key: typeof job.key === "string" ? job.key : undefined,
      label: typeof job.label === "string" ? job.label : undefined,
      jobType: job.jobType,
      queueClass: typeof job.queueClass === "string" ? job.queueClass : undefined,
      priority,
      dependencies,
    };
  });

  const ids = new Set();
  for (const job of normalized) {
    if (ids.has(job.id)) {
      throw new Error(`Duplicate DAG job id detected: ${job.id}`);
    }
    ids.add(job.id);
  }

  for (const job of normalized) {
    for (const dependency of job.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(
          `Job "${job.id}" depends on unknown job "${dependency}".`
        );
      }
      if (dependency === job.id) {
        throw new Error(`Job "${job.id}" cannot depend on itself.`);
      }
    }
  }

  const dependentsById = new Map(normalized.map((job) => [job.id, []]));
  const indegree = new Map(normalized.map((job) => [job.id, job.dependencies.length]));
  for (const job of normalized) {
    for (const dependency of job.dependencies) {
      dependentsById.get(dependency).push(job.id);
    }
  }

  const ready = normalized
    .filter((job) => job.dependencies.length === 0)
    .map((job) => job.id);
  const topo = [];
  const queue = [...ready];
  while (queue.length > 0) {
    const currentId = queue.shift();
    topo.push(currentId);
    for (const dependentId of dependentsById.get(currentId) ?? []) {
      const next = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, next);
      if (next === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (topo.length !== normalized.length) {
    throw new Error("DAG graph contains a cycle.");
  }

  const maxPriority = normalized.reduce(
    (current, job) => Math.max(current, job.priority),
    0
  );

  const graphJobs = normalized.map((job) =>
    Object.freeze({
      ...job,
      dependencies: Object.freeze([...job.dependencies]),
      dependents: Object.freeze([...(dependentsById.get(job.id) ?? [])]),
      dependencyCount: job.dependencies.length,
      root: job.dependencies.length === 0,
    })
  );

  return Object.freeze({
    mode: "dag",
    jobCount: graphJobs.length,
    maxPriority,
    roots: Object.freeze(graphJobs.filter((job) => job.root).map((job) => job.id)),
    topologicalOrder: Object.freeze(topo),
    jobs: Object.freeze(graphJobs),
  });
}
