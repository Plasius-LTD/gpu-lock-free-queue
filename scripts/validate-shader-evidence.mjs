#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { admitQualificationBundle } from "@plasius/gpu-shader/node";
import {
  validateShaderValidationEvidence,
  validateStableWebGpuMatrix,
} from "@plasius/gpu-shader/testing";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--") || result.has(name)) {
      throw new Error(`Invalid or duplicate evidence argument ${name ?? "<missing>"}.`);
    }
    result.set(name, value);
  }
  return result;
}

async function parseJsonFile(filePath, label) {
  const bytes = new Uint8Array(await readFile(filePath));
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${label} must be UTF-8 JSON.`, { cause: error });
  }
  return { bytes, value };
}

export async function validateShaderEvidence(
  values = process.argv.slice(2),
  environment = process.env,
) {
  const args = argumentsMap(values);
  const allowed = new Set(["--flat", "--demo", "--dag"]);
  for (const name of args.keys()) {
    if (!allowed.has(name)) throw new Error(`Unsupported argument ${name}.`);
  }
  const evidencePaths = {
    flat: args.get("--flat") ?? environment.FLAT_SHADER_EVIDENCE_PATH,
    demo: args.get("--demo") ?? environment.DEMO_SHADER_EVIDENCE_PATH,
    dag: args.get("--dag") ?? environment.DAG_SHADER_EVIDENCE_PATH,
  };
  if (!evidencePaths.flat || !evidencePaths.demo || !evidencePaths.dag) {
    throw new Error(
      "Complete physical-matrix evidence is required for flat, demo, and DAG shaders. "
      + "Set FLAT_SHADER_EVIDENCE_PATH, DEMO_SHADER_EVIDENCE_PATH, and "
      + "DAG_SHADER_EVIDENCE_PATH or pass --flat, --demo, and --dag.",
    );
  }

  const matrixArtifact = await parseJsonFile(
    path.join(projectRoot, "qualification", "stable-webgpu-matrix.json"),
    "Stable WebGPU matrix",
  );
  const matrix = validateStableWebGpuMatrix(matrixArtifact.value);
  if (!matrix.ok) {
    throw new Error(matrix.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  }

  for (const kind of ["flat", "demo", "dag"]) {
    const admitted = await admitQualificationBundle(path.join(projectRoot, "qualification", kind));
    const evidence = await parseJsonFile(path.resolve(evidencePaths[kind]), `${kind} evidence`);
    const result = await validateShaderValidationEvidence({
      evidence: evidence.value,
      bundle: admitted.manifest,
      matrix: matrix.value,
      matrixBytes: matrixArtifact.bytes,
    });
    if (!result.ok) {
      throw new Error(
        `${kind} physical evidence failed: ${result.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`,
      );
    }
    if (result.value.status !== "passed") {
      throw new Error(`${kind} physical evidence is not passing.`);
    }
  }
  process.stdout.write("Complete flat, demo, and DAG physical-matrix evidence validated.\n");
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  validateShaderEvidence().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
