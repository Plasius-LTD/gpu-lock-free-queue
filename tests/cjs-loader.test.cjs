const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadQueueWgsl, queueWgslUrl } = require("../src/index.cjs");

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
