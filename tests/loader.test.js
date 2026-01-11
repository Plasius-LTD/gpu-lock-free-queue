import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQueueWgsl } from "../src/index.js";

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
