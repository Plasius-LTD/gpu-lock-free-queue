import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(
  path.join(projectRoot, ".github", "workflows", "ci.yml"),
  "utf8",
);

test("CI uses explicit approved self-hosted labels without a hosted fallback", () => {
  assert.match(workflow, /runs-on: \[self-hosted, Linux, X64, playwright\]/u);
  assert.match(workflow, /runs-on: \[self-hosted, Linux, X64\]/u);
  assert.doesNotMatch(workflow, /runs-on:.*(?:fromJSON|vars\.)/u);
  assert.doesNotMatch(workflow, /runs-on:.*(?:ubuntu|windows|macos)-latest/u);
  assert.match(workflow, /npx playwright install chromium/u);
  assert.doesNotMatch(workflow, /playwright install --with-deps/u);
});

test("pull requests cannot run external-fork code on self-hosted capacity", () => {
  assert.match(workflow, /\n {2}pull_request:\n {4}branches: \[main\]/u);
  assert.doesNotMatch(workflow, /pull_request_target/u);

  const trustedHeadGuards = workflow.match(
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/gu,
  );
  assert.equal(trustedHeadGuards?.length, 2);
});

test("CI runs the final public-artifact admission check", () => {
  assert.match(workflow, /public-artifact-integrity:/u);
  assert.match(
    workflow,
    /node \.\/scripts\/verify-public-artifacts\.cjs --package-dir \./u,
  );
});
