import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  collectSourceMatches,
  main,
  normalizeArtifactPath,
  parseArguments,
  validatePackageDirectory,
} = require("../scripts/verify-public-artifacts.cjs");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "public-artifact-integrity-"));
  temporaryDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

test("artifact paths are normalized across package, case, and separator variants", () => {
  const variants = [
    "legal/CLA-REGISTRY.csv",
    "./LEGAL/cla-registry.CSV",
    "package/legal/Cla-Registry.csv",
    "package\\legal\\CLA-REGISTRY.csv",
  ];

  for (const variant of variants) {
    assert.equal(normalizeArtifactPath(variant), "legal/cla-registry.csv");
  }
});

test("source inspection detects a case variant without reading file contents", () => {
  const root = createRepository();
  fs.mkdirSync(path.join(root, "legal"));
  fs.writeFileSync(path.join(root, "legal", "cLa-ReGiStRy.CsV"), "synthetic fixture\n");

  assert.deepEqual(collectSourceMatches(root), ["legal/cLa-ReGiStRy.CsV"]);
});

test("source inspection rejects a symlinked legal boundary", () => {
  const root = createRepository();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "public-artifact-target-"));
  temporaryDirectories.push(target);
  fs.symlinkSync(target, path.join(root, "legal"), "dir");

  assert.throws(
    () => collectSourceMatches(root),
    /legal path is a symlink/u,
  );
});

test("argument parsing is strict and defaults to the repository package", () => {
  assert.deepEqual(parseArguments([]), {
    packageDirectories: ["."],
    sourceOnly: false,
  });
  assert.deepEqual(parseArguments(["--source-only"]), {
    packageDirectories: [],
    sourceOnly: true,
  });
  assert.throws(
    () => parseArguments(["--source-only", "--package-dir", "."]),
    /cannot be combined/u,
  );
  assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/u);
});

test("package directories cannot escape the repository boundary", () => {
  const root = createRepository();
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");

  assert.equal(validatePackageDirectory(root, "."), root);
  assert.throws(
    () => validatePackageDirectory(root, ".."),
    /escapes repository root/u,
  );
});

test("the repository source and final npm inventory satisfy admission", () => {
  assert.match(
    main(["--package-dir", "."], projectRoot),
    /1 npm package inventory check\(s\) passed/u,
  );
});
