import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDagJobGraph,
  dagQueueWgslUrl,
  loadDagQueueWgsl,
  loadQueueWgsl,
  loadSchedulerWgsl,
  schedulerModes,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const wgslPath = path.resolve(projectRoot, "src", "queue.wgsl");

test("loadQueueWgsl reads WGSL text in Node", async () => {
  const expected = fs.readFileSync(wgslPath, "utf8");
  const actual = await loadQueueWgsl();
  assert.strictEqual(actual, expected);
});

test("loadQueueWgsl uses provided fetcher for non-file URLs", async () => {
  const fakeFetch = async (url) => ({
    ok: true,
    text: async () => `wgsl from ${url}`,
  });
  const url = new URL("https://example.invalid/queue.wgsl");
  const actual = await loadQueueWgsl({ url, fetcher: fakeFetch });
  assert.strictEqual(actual, `wgsl from ${url}`);
});

test("loadQueueWgsl throws on non-ok responses", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    text: async () => "missing",
  });
  const url = new URL("https://example.invalid/queue.wgsl");
  await assert.rejects(
    loadQueueWgsl({ url, fetcher: fakeFetch }),
    /Failed to load WGSL \(404 Not Found\)/
  );
});

test("loadQueueWgsl handles null options via file fallback", async () => {
  const expected = fs.readFileSync(wgslPath, "utf8");
  const actual = await loadQueueWgsl(null);
  assert.strictEqual(actual, expected);
});

test("loadQueueWgsl reports unknown status shape", async () => {
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

test("loadDagQueueWgsl reads DAG WGSL text in Node", async () => {
  const actual = await loadDagQueueWgsl();
  assert.ok(actual.includes("struct ReadyQueue"));
  assert.ok(actual.includes("fn complete_job"));
});

test("loadSchedulerWgsl selects assets by scheduler mode", async () => {
  const flat = await loadSchedulerWgsl({ mode: "flat" });
  const dag = await loadSchedulerWgsl({ mode: "dag" });

  assert.ok(flat.includes("struct Queue"));
  assert.ok(dag.includes("struct ReadyQueue"));
  assert.deepEqual(schedulerModes, ["flat", "dag"]);
  assert.ok(dagQueueWgslUrl.pathname.endsWith("/dag-queue.wgsl"));
});

test("createDagJobGraph normalizes roots, dependents, and topological order", () => {
  const graph = createDagJobGraph([
    { id: "g-buffer", priority: 4 },
    { id: "shadow", priority: 3 },
    { id: "lighting", dependencies: ["g-buffer", "shadow"], priority: 2 },
    { id: "composite", dependencies: ["lighting"], priority: 1 },
  ]);

  assert.equal(graph.mode, "dag");
  assert.equal(graph.jobCount, 4);
  assert.equal(graph.maxPriority, 4);
  assert.deepEqual(graph.roots, ["g-buffer", "shadow"]);
  assert.deepEqual(graph.topologicalOrder, [
    "g-buffer",
    "shadow",
    "lighting",
    "composite",
  ]);

  const lighting = graph.jobs.find((job) => job.id === "lighting");
  assert.deepEqual(lighting.dependencies, ["g-buffer", "shadow"]);
  assert.deepEqual(lighting.dependents, ["composite"]);
});

test("createDagJobGraph rejects invalid dependency graphs", () => {
  assert.throws(
    () =>
      createDagJobGraph([
        { id: "a", dependencies: ["missing"] },
      ]),
    /depends on unknown job/
  );
  assert.throws(
    () =>
      createDagJobGraph([
        { id: "a", dependencies: ["b"] },
        { id: "b", dependencies: ["a"] },
      ]),
    /contains a cycle/
  );
});
