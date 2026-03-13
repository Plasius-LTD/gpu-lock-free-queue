const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createDagJobGraph,
  dagQueueWgslUrl,
  loadDagQueueWgsl,
  loadQueueWgsl,
  loadSchedulerWgsl,
  queueWgslUrl,
  schedulerModes,
} = require("../src/index.cjs");

const projectRoot = path.resolve(__dirname, "..");
const wgslPath = path.resolve(projectRoot, "src", "queue.wgsl");

test("CJS queueWgslUrl points at queue.wgsl", () => {
  assert.ok(queueWgslUrl instanceof URL);
  assert.ok(queueWgslUrl.pathname.endsWith("/queue.wgsl"));
});

test("CJS loadQueueWgsl reads WGSL text from file URL", async () => {
  const expected = fs.readFileSync(wgslPath, "utf8");
  const actual = await loadQueueWgsl(null);
  assert.equal(actual, expected);
});

test("CJS loadQueueWgsl supports custom fetchers", async () => {
  const url = new URL("https://example.invalid/queue.wgsl");
  const fakeFetch = async (resolved) => ({
    ok: true,
    text: async () => `cjs:${resolved}`,
  });
  const actual = await loadQueueWgsl({ url, fetcher: fakeFetch });
  assert.equal(actual, "cjs:https://example.invalid/queue.wgsl");
});

test("CJS loadQueueWgsl reports unknown status details", async () => {
  const fakeFetch = async () => ({
    ok: false,
    text: async () => "missing",
  });
  await assert.rejects(
    loadQueueWgsl({
      url: new URL("https://example.invalid/queue.wgsl"),
      fetcher: fakeFetch,
    }),
    /Failed to load WGSL \(unknown\)/
  );
});

test("CJS loadDagQueueWgsl reads DAG WGSL text from file URL", async () => {
  const actual = await loadDagQueueWgsl();
  assert.ok(actual.includes("struct ReadyQueue"));
  assert.ok(actual.includes("fn complete_job"));
});

test("CJS loadSchedulerWgsl selects assets by mode", async () => {
  const flat = await loadSchedulerWgsl({ mode: "flat" });
  const dag = await loadSchedulerWgsl({ mode: "dag" });

  assert.ok(flat.includes("struct Queue"));
  assert.ok(dag.includes("struct ReadyQueue"));
  assert.deepEqual(schedulerModes, ["flat", "dag"]);
  assert.ok(dagQueueWgslUrl.pathname.endsWith("/dag-queue.wgsl"));
});

test("CJS createDagJobGraph exposes roots and order", () => {
  const graph = createDagJobGraph([
    { id: "root-a", priority: 2 },
    { id: "root-b", priority: 1 },
    { id: "join", dependencies: ["root-a", "root-b"], priority: 0 },
  ]);

  assert.deepEqual(graph.roots, ["root-a", "root-b"]);
  assert.deepEqual(graph.topologicalOrder, ["root-a", "root-b", "join"]);
});
