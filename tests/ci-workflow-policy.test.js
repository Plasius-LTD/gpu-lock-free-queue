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

test("CI uses schema's hosted PR and trusted main runner selection", () => {
  assert.equal(workflow.match(/needs: trusted_head/gu)?.length, 2);
  assert.equal(workflow.match(/runs-on: \$\{\{ fromJSON\(github.event_name == 'pull_request'/gu)?.length, 2);
  assert.match(workflow, /\["ubuntu-latest"\]/u);
  assert.match(workflow, /\["self-hosted","Linux","X64"\]/u);
  assert.match(workflow, /runner.environment == 'github-hosted'/u);
  assert.doesNotMatch(workflow, /fromJSON\(vars\./u);
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
  assert.match(workflow, /public_artifact_integrity:/u);
  assert.match(
    workflow,
    /node \.\/scripts\/verify-private-artifacts\.cjs/u,
  );
});

test("coverage enforcement blocks delivery while Codecov telemetry is best effort", () => {
  assert.match(workflow, /Enforce line coverage >= 80%/u);
  assert.match(workflow, /uses: codecov\/codecov-action@v4/u);
  assert.match(
    workflow,
    /name: Upload coverage to Codecov\n {8}continue-on-error: true/u,
  );
});
