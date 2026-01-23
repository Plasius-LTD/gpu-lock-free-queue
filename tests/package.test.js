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
