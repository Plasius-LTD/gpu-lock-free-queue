import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queueWgslUrl } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const wgslPath = path.resolve(projectRoot, "src", "queue.wgsl");

test("queue WGSL file exists", () => {
  assert.ok(fs.existsSync(wgslPath));
  assert.ok(fs.existsSync(path.resolve(projectRoot, "src", "dag-queue.wgsl")));
});

test("queueWgslUrl points at queue.wgsl", () => {
  assert.ok(queueWgslUrl instanceof URL);
  assert.ok(queueWgslUrl.pathname.endsWith("/queue.wgsl"));
});

test("queue WGSL contains required bindings", () => {
  const wgsl = fs.readFileSync(wgslPath, "utf8");
  assert.ok(wgsl.includes("@group(0) @binding(0)"));
  assert.ok(wgsl.includes("@group(0) @binding(1)"));
  assert.ok(wgsl.includes("@group(0) @binding(2)"));
  assert.ok(wgsl.includes("@group(0) @binding(3)"));
  assert.ok(wgsl.includes("@group(0) @binding(4)"));
  assert.ok(wgsl.includes("@group(0) @binding(5)"));
  assert.ok(wgsl.includes("@group(0) @binding(6)"));
  assert.ok(wgsl.includes("@group(0) @binding(7)"));
  assert.ok(wgsl.includes("enqueue_main"));
  assert.ok(wgsl.includes("dequeue_main"));
  assert.ok(wgsl.includes("complete_job"));
});

test("queue WGSL defines expected queue fields", () => {
  const wgsl = fs.readFileSync(wgslPath, "utf8");
  assert.ok(wgsl.includes("struct Queue"));
  assert.ok(wgsl.includes("head: atomic<u32>"));
  assert.ok(wgsl.includes("tail: atomic<u32>"));
  assert.ok(wgsl.includes("capacity: u32"));
  assert.ok(wgsl.includes("mask: u32"));
});

test("queue WGSL includes retry budget constant", () => {
  const wgsl = fs.readFileSync(wgslPath, "utf8");
  assert.ok(/const\s+MAX_RETRIES\s*:\s*u32\s*=/.test(wgsl));
});

test("queue WGSL exposes queue length helper", () => {
  const wgsl = fs.readFileSync(wgslPath, "utf8");
  assert.ok(wgsl.includes("fn queue_len"));
});

test("queue WGSL validates queue configuration", () => {
  const wgsl = fs.readFileSync(wgslPath, "utf8");
  assert.ok(wgsl.includes("fn queue_config_valid"));
  assert.ok(wgsl.includes("arrayLength(&slots)"));
  assert.match(wgsl, /queue\.capacity\s*&\s*\(queue\.capacity\s*-\s*1u\)/);
  assert.match(wgsl, /queue\.mask\s*!=\s*queue\.capacity\s*-\s*1u/);
});

test("queue WGSL bounds job count to buffer lengths", () => {
  const wgsl = fs.readFileSync(wgslPath, "utf8");
  assert.ok(wgsl.includes("fn enqueue_job_count"));
  assert.ok(wgsl.includes("fn dequeue_job_count"));
  assert.ok(wgsl.includes("arrayLength(&input_jobs)"));
  assert.ok(wgsl.includes("arrayLength(&output_jobs)"));
  assert.ok(wgsl.includes("arrayLength(&output_payloads)"));
  assert.ok(wgsl.includes("arrayLength(&status)"));
});

test("dag queue WGSL exposes ready queues and dependency completion helpers", () => {
  const wgsl = fs.readFileSync(
    path.resolve(projectRoot, "src", "dag-queue.wgsl"),
    "utf8"
  );

  assert.ok(wgsl.includes("struct ReadyQueue"));
  assert.ok(wgsl.includes("struct JobNode"));
  assert.ok(wgsl.includes("fn ready_queue_index"));
  assert.ok(wgsl.includes("fn complete_job"));
  assert.ok(wgsl.includes("priority_step"));
});

test("demo imports gpu-shared through the public package surface", () => {
  const demoSource = fs.readFileSync(path.resolve(projectRoot, "demo", "main.js"), "utf8");
  const demoHtml = fs.readFileSync(path.resolve(projectRoot, "demo", "index.html"), "utf8");

  assert.match(demoSource, /from "@plasius\/gpu-shared"/);
  assert.doesNotMatch(demoSource, /node_modules\/@plasius\/gpu-shared\/dist/);
  assert.match(demoHtml, /<script type="importmap">/);
  assert.match(
    demoHtml,
    /"@plasius\/gpu-shared"\s*:\s*"\.\.\/node_modules\/@plasius\/gpu-shared\/dist\/index\.js"/,
  );
});

test("README documents the live 3D queue validation demo", () => {
  const readme = fs.readFileSync(path.resolve(projectRoot, "README.md"), "utf8");

  assert.match(readme, /mounts the shared `@plasius\/gpu-shared` 3D harbor surface/i);
  assert.match(readme, /Root jobs, priority\s+lanes, dependency joins, and stress-mode graph expansion/i);
  assert.doesNotMatch(readme, /FFT spectrogram/i);
  assert.doesNotMatch(readme, /Then open `http:\/\/localhost:8000` and check the console\/output/i);
});
