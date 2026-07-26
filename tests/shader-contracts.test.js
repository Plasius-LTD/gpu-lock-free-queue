import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  generateShaderContracts,
} from "../scripts/generate-shader-contracts.mjs";
import {
  argumentsMap,
  validateShaderEvidence,
} from "../scripts/validate-shader-evidence.mjs";

test("generated shader contracts exactly match all three WGSL sources", async () => {
  await generateShaderContracts("--check");
});

test("shader contract generation rejects unsupported modes", async () => {
  await assert.rejects(
    generateShaderContracts("--unsafe"),
    /Usage: node scripts\/generate-shader-contracts\.mjs \[--check\|--write\|--copy-dist\]/,
  );
});

test("physical evidence validation requires every shader bundle", async () => {
  await assert.rejects(
    validateShaderEvidence([], {}),
    /Complete physical-matrix evidence is required for flat, demo, and DAG shaders/,
  );
});

test("physical evidence arguments reject malformed, duplicate, and unsupported names", async () => {
  assert.throws(
    () => argumentsMap(["--flat"]),
    /Invalid or duplicate evidence argument --flat/,
  );
  assert.throws(
    () => argumentsMap(["--flat", "one.json", "--flat", "two.json"]),
    /Invalid or duplicate evidence argument --flat/,
  );
  await assert.rejects(
    validateShaderEvidence(["--other", "evidence.json"], {}),
    /Unsupported argument --other/,
  );
  assert.deepEqual(
    [...argumentsMap(["--flat", "flat.json", "--demo", "demo.json", "--dag", "dag.json"])],
    [
      ["--flat", "flat.json"],
      ["--demo", "demo.json"],
      ["--dag", "dag.json"],
    ],
  );
});

test("physical evidence validation rejects malformed digest-bound evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gpu-queue-evidence-"));
  const evidencePath = path.join(directory, "evidence.json");
  try {
    await writeFile(evidencePath, "{}\n", "utf8");
    await assert.rejects(
      validateShaderEvidence([
        "--flat", evidencePath,
        "--demo", evidencePath,
        "--dag", evidencePath,
      ], {}),
      /flat physical evidence failed/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
