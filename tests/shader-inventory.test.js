import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");

async function discoverWgslFiles(directory, prefix) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await discoverWgslFiles(absolute, relative));
    } else if (entry.isFile() && entry.name.endsWith(".wgsl")) {
      files.push(relative);
    }
  }
  return files.sort();
}

test("every repository WGSL asset belongs to an executable compile unit", async () => {
  const inventory = JSON.parse(
    await fs.readFile(path.join(projectRoot, "qualification", "inventory.json"), "utf8"),
  );
  const discovered = [
    ...await discoverWgslFiles(path.join(projectRoot, "src"), "src"),
    ...await discoverWgslFiles(path.join(projectRoot, "demo"), "demo"),
  ].sort();
  const declared = inventory.fragments.map((fragment) => fragment.path).sort();

  assert.deepEqual(discovered, [
    "demo/queue.wgsl",
    "src/dag-queue.wgsl",
    "src/queue.wgsl",
  ]);
  assert.deepEqual(declared, discovered);
  assert.deepEqual(
    inventory.compileUnits.map((unit) => unit.compileUnitId).sort(),
    ["queue.dag.v1", "queue.demo.v1", "queue.flat.v1"],
  );

  const referencedFragments = new Set(
    inventory.compileUnits.flatMap((unit) => unit.fragmentIds),
  );
  for (const fragment of inventory.fragments) {
    assert.ok(
      referencedFragments.has(fragment.fragmentId),
      `${fragment.path} is not assigned to a compile unit`,
    );
  }

  for (const unit of inventory.compileUnits) {
    assert.deepEqual(
      unit.entryPoints.map((entryPoint) => `${entryPoint.stage}:${entryPoint.name}`).sort(),
      ["compute:dequeue_main", "compute:enqueue_main"],
      `${unit.compileUnitId} must exercise both queue paths`,
    );
    assert.equal(unit.pipelines.length, 2);
    assert.ok(unit.qualificationFixture?.path);
  }
});

test("every shader bundle requires the complete stable-WebGPU matrix", async () => {
  const matrix = JSON.parse(
    await fs.readFile(
      path.join(projectRoot, "qualification", "stable-webgpu-matrix.json"),
      "utf8",
    ),
  );
  const expectedCellIds = matrix.cells.map((cell) => cell.cellId).sort();

  assert.equal(matrix.matrixId, "stable-webgpu");
  assert.ok(matrix.version);
  assert.equal(expectedCellIds.length, 16);

  for (const kind of ["flat", "demo", "dag"]) {
    const bundle = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, "qualification", kind, "qualification.json"),
        "utf8",
      ),
    );
    assert.deepEqual(
      [...bundle.subject.requiredCellIds].sort(),
      expectedCellIds,
      `${kind} does not require every stable-WebGPU cell`,
    );
    assert.deepEqual(
      bundle.subject.requiredCompileUnitIds,
      [`queue.${kind}.v1`],
    );
  }
});
