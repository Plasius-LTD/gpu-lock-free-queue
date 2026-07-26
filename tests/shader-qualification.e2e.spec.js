import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const requireWebGpuValidation = process.env.REQUIRE_WEBGPU_VALIDATION === "true";
const requireSwiftShaderValidation = process.env.REQUIRE_SWIFTSHADER_VALIDATION === "true";

function createSecureContextServer() {
  return http.createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    response.end("<!doctype html><html><body>WGSL qualification</body></html>");
  });
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
}

async function createBrowserPayload() {
  const inventory = await readJson("qualification/inventory.json");
  const fragments = new Map(inventory.fragments.map((fragment) => [fragment.fragmentId, fragment]));
  const units = [];

  for (const unit of inventory.compileUnits) {
    const [kind] = unit.qualificationFixture.path.split("/");
    if (!["flat", "demo", "dag"].includes(kind)) {
      throw new Error(`Unknown qualification bundle kind for ${unit.compileUnitId}.`);
    }
    const fixture = await readJson(`qualification/${unit.qualificationFixture.path}`);
    const shaderCore = await readJson(`qualification/${kind}/manifests/shader-core.json`);
    const moduleSources = {};
    for (const module of unit.modules) {
      const sourceParts = [];
      for (const fragmentId of module.assembly.fragmentIds) {
        const fragment = fragments.get(fragmentId);
        if (!fragment) throw new Error(`Unknown fragment ${fragmentId}.`);
        sourceParts.push(await fs.readFile(path.join(projectRoot, fragment.path), "utf8"));
      }
      moduleSources[module.moduleId] = sourceParts.join("\n");
    }
    const initialData = {};
    for (const resource of fixture.resources) {
      if (!resource.initialData) continue;
      const bytes = await fs.readFile(
        path.join(projectRoot, "qualification", kind, resource.initialData.path),
      );
      initialData[resource.resourceId] = bytes.toString("base64");
    }
    units.push({ unit, fixture, shaderCore, moduleSources, initialData });
  }
  return { units, requireSwiftShaderValidation };
}

test.describe("manifest-driven WGSL qualification", () => {
  let server;
  let baseUrl;

  test.beforeAll(async () => {
    server = createSecureContextServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address.");
    baseUrl = `http://127.0.0.1:${address.port}/`;
  });

  test.afterAll(async () => {
    if (!server) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test("every queue compile unit creates explicit resources, dispatches, and verifies semantic readback", async ({ page }) => {
    await page.goto(baseUrl);
    const hasGpu = await page.evaluate(() => Boolean(navigator.gpu));
    if (!hasGpu) {
      if (requireWebGpuValidation) {
        throw new Error("WebGPU validation is required, but navigator.gpu is unavailable.");
      }
      test.skip(true, "WebGPU is unavailable on this optional local run.");
    }

    const payload = await createBrowserPayload();
    const result = await page.evaluate(async (input) => {
      const decodeBase64 = (value) => {
        const binary = atob(value);
        const result = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
        return result;
      };
      const digest = async (bytes) => {
        const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        return [...hash].map((value) => value.toString(16).padStart(2, "0")).join("");
      };
      const adapterInfo = async (adapter) => {
        if (adapter.info && typeof adapter.info === "object") return adapter.info;
        if (typeof adapter.requestAdapterInfo === "function") return adapter.requestAdapterInfo();
        return {};
      };
      const bufferUsage = (items) => {
        const values = {
          "map-read": GPUBufferUsage.MAP_READ,
          "map-write": GPUBufferUsage.MAP_WRITE,
          "copy-src": GPUBufferUsage.COPY_SRC,
          "copy-dst": GPUBufferUsage.COPY_DST,
          index: GPUBufferUsage.INDEX,
          vertex: GPUBufferUsage.VERTEX,
          uniform: GPUBufferUsage.UNIFORM,
          storage: GPUBufferUsage.STORAGE,
          indirect: GPUBufferUsage.INDIRECT,
          "query-resolve": GPUBufferUsage.QUERY_RESOLVE,
        };
        return items.reduce((mask, item) => mask | values[item], 0);
      };
      const bindGroupLayoutEntry = (entry) => {
        if (entry.resource.kind !== "buffer") {
          throw new Error(`Unexpected resource kind ${entry.resource.kind}.`);
        }
        return {
          binding: entry.binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: entry.resource.addressSpace === "uniform"
              ? "uniform"
              : entry.resource.access === "read"
                ? "read-only-storage"
                : "storage",
            hasDynamicOffset: false,
            minBindingSize: entry.resource.minimumBindingSize,
          },
        };
      };
      const toU32 = (bytes) => {
        const values = [];
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let offset = 0; offset < bytes.byteLength; offset += 4) {
          values.push(view.getUint32(offset, true));
        }
        return values;
      };

      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "low-power",
        forceFallbackAdapter: input.requireSwiftShaderValidation,
      });
      if (!adapter) return { ok: false, reason: "adapter-unavailable" };
      const info = await adapterInfo(adapter);
      const adapterText = Object.values(info).map(String).join(" ").toLowerCase();
      if (input.requireSwiftShaderValidation && !adapterText.includes("swiftshader")) {
        return { ok: false, reason: "swiftshader-not-selected", info };
      }

      const requiredLimits = {};
      for (const { shaderCore } of input.units) {
        for (const limit of shaderCore.requirements.limits) {
          if (limit.comparator !== "at-least") continue;
          requiredLimits[limit.name] = Math.max(requiredLimits[limit.name] ?? 0, limit.value);
        }
      }
      for (const [name, value] of Object.entries(requiredLimits)) {
        if (typeof adapter.limits[name] !== "number" || adapter.limits[name] < value) {
          return { ok: false, reason: `adapter-limit:${name}`, expected: value, actual: adapter.limits[name] ?? null };
        }
      }
      const device = await adapter.requestDevice({ requiredLimits });
      const uncaptured = [];
      device.addEventListener("uncapturederror", (event) => uncaptured.push(event.error?.message ?? String(event.error)));
      const lost = device.lost.then((detail) => ({ lost: true, reason: detail.reason, message: detail.message }));
      const unitResults = [];

      try {
        for (const item of input.units) {
          const { unit, fixture, moduleSources, initialData } = item;
          const modules = new Map();
          for (const moduleDeclaration of unit.modules) {
            const source = moduleSources[moduleDeclaration.moduleId];
            const module = device.createShaderModule({
              label: `qualification:${unit.compileUnitId}:${moduleDeclaration.moduleId}`,
              code: source,
            });
            if (typeof module.getCompilationInfo !== "function") {
              throw new Error("GPUShaderModule.getCompilationInfo() is required.");
            }
            const compilationInfo = await module.getCompilationInfo();
            const errors = compilationInfo.messages
              .filter((message) => message.type === "error")
              .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`);
            if (errors.length > 0) throw new Error(`${unit.compileUnitId} WGSL compilation failed: ${errors.join("; ")}`);
            modules.set(moduleDeclaration.moduleId, module);
          }

          device.pushErrorScope("validation");
          const resources = new Map();
          const destroyable = [];
          try {
            for (const resource of fixture.resources) {
              if (resource.kind !== "buffer") throw new Error(`Unsupported fixture resource ${resource.kind}.`);
              const buffer = device.createBuffer({
                label: `qualification:${unit.compileUnitId}:${resource.resourceId}`,
                size: resource.byteLength,
                usage: bufferUsage(resource.usage),
              });
              destroyable.push(buffer);
              resources.set(resource.resourceId, buffer);
              const encoded = initialData[resource.resourceId];
              if (encoded !== undefined) {
                const bytes = decodeBase64(encoded);
                if (bytes.byteLength !== resource.byteLength) throw new Error(`Initial bytes differ for ${resource.resourceId}.`);
                device.queue.writeBuffer(buffer, 0, bytes);
              }
            }

            const pipelineState = new Map();
            for (const descriptor of unit.pipelines) {
              const bindGroupLayouts = descriptor.layout.bindGroups.map((group) => device.createBindGroupLayout({
                label: `qualification:${descriptor.pipelineId}:group:${group.group}`,
                entries: group.entries.map(bindGroupLayoutEntry),
              }));
              const pipelineLayout = device.createPipelineLayout({
                label: `qualification:${descriptor.pipelineId}:layout`,
                bindGroupLayouts,
              });
              const pipelineDescriptor = {
                label: `qualification:${descriptor.pipelineId}`,
                layout: pipelineLayout,
                compute: {
                  module: modules.get(descriptor.compute.moduleId),
                  entryPoint: descriptor.compute.entryPoint,
                  constants: descriptor.compute.constants,
                },
              };
              const pipeline = typeof device.createComputePipelineAsync === "function"
                ? await device.createComputePipelineAsync(pipelineDescriptor)
                : device.createComputePipeline(pipelineDescriptor);
              pipelineState.set(descriptor.pipelineId, { pipeline, bindGroupLayouts });
            }

            const fixtureGroups = new Map(fixture.bindGroups.map((group) => [group.bindGroupId, group]));
            const materializedGroups = new Map();
            const groupFor = (pipelineId, bindGroupId) => {
              const key = `${pipelineId}:${bindGroupId}`;
              if (materializedGroups.has(key)) return materializedGroups.get(key);
              const declaration = fixtureGroups.get(bindGroupId);
              const state = pipelineState.get(pipelineId);
              if (!declaration || !state) throw new Error(`Missing bind group ${key}.`);
              const group = device.createBindGroup({
                label: `qualification:${key}`,
                layout: state.bindGroupLayouts[declaration.group],
                entries: declaration.entries.map((entry) => ({
                  binding: entry.binding,
                  resource: {
                    buffer: resources.get(entry.resource.resourceId),
                    offset: entry.resource.offset,
                    size: entry.resource.size,
                  },
                })),
              });
              materializedGroups.set(key, group);
              return group;
            };

            const commandEncoder = device.createCommandEncoder({ label: `qualification:${unit.compileUnitId}:commands` });
            for (const command of fixture.commands) {
              if (command.kind === "dispatch") {
                if (command.workgroups.some((value) => value < 1 || value > 1024)) {
                  throw new Error(`Dispatch for ${command.pipelineId} is outside the repository bound.`);
                }
                const pass = commandEncoder.beginComputePass({ label: `qualification:${command.pipelineId}:dispatch` });
                pass.setPipeline(pipelineState.get(command.pipelineId).pipeline);
                command.bindGroupIds.forEach((bindGroupId, groupIndex) => {
                  pass.setBindGroup(groupIndex, groupFor(command.pipelineId, bindGroupId));
                });
                pass.dispatchWorkgroups(...command.workgroups);
                pass.end();
              } else if (command.kind === "copy-buffer") {
                commandEncoder.copyBufferToBuffer(
                  resources.get(command.source),
                  0,
                  resources.get(command.destination),
                  0,
                  command.byteLength,
                );
              } else {
                throw new Error(`Unsupported command ${command.kind}.`);
              }
            }
            device.queue.submit([commandEncoder.finish()]);
            const completion = device.queue.onSubmittedWorkDone().then(() => ({ lost: false }));
            const completionResult = await Promise.race([completion, lost]);
            if (completionResult.lost) throw new Error(`WebGPU device lost: ${completionResult.reason} ${completionResult.message}`);

            const outputs = {};
            for (const readback of fixture.readbacks) {
              const buffer = resources.get(readback.resourceId);
              await buffer.mapAsync(GPUMapMode.READ, readback.byteOffset, readback.byteLength);
              const bytes = new Uint8Array(buffer.getMappedRange(readback.byteOffset, readback.byteLength)).slice();
              buffer.unmap();
              const actual = await digest(bytes);
              if (actual !== readback.expectedSha256) {
                throw new Error(`${unit.compileUnitId} readback ${readback.resourceId} digest differs.`);
              }
              outputs[readback.resourceId] = toU32(bytes);
            }
            const validationError = await device.popErrorScope();
            if (validationError) throw new Error(`WebGPU validation error: ${validationError.message}`);
            unitResults.push({ compileUnitId: unit.compileUnitId, outputs });
          } catch (error) {
            await device.popErrorScope().catch(() => null);
            throw error;
          } finally {
            for (const resource of destroyable) resource.destroy();
          }
        }
      } finally {
        device.destroy();
      }
      if (uncaptured.length > 0) throw new Error(`Uncaptured WebGPU errors: ${uncaptured.join("; ")}`);
      return { ok: true, info, unitResults };
    }, payload);

    if (!result.ok) {
      if (requireWebGpuValidation) {
        throw new Error(`Required WebGPU qualification failed: ${JSON.stringify(result)}`);
      }
      test.skip(true, `Optional local WebGPU route unavailable: ${result.reason}`);
    }

    expect(result.unitResults.map((item) => item.compileUnitId).sort()).toEqual([
      "queue.dag.v1",
      "queue.demo.v1",
      "queue.flat.v1",
    ]);
    for (const compileUnitId of ["queue.flat.v1", "queue.demo.v1"]) {
      const unit = result.unitResults.find((item) => item.compileUnitId === compileUnitId);
      expect(unit.outputs["readback-output-job"]).toEqual([7, 0, 2, 0]);
      expect(unit.outputs["readback-output-payload"]).toEqual([42, 99]);
      expect(unit.outputs["readback-enqueue-status"]).toEqual([1]);
      expect(unit.outputs["readback-dequeue-status"]).toEqual([1]);
    }

    const dag = result.unitResults.find((item) => item.compileUnitId === "queue.dag.v1");
    expect(dag.outputs["readback-output-job"].slice(0, 5)).toEqual([0, 11, 1, 0, 2]);
    expect(dag.outputs["readback-output-payload"]).toEqual([101, 202]);
    expect(dag.outputs["readback-ready-queues"]).toEqual([0, 0, 4, 3, 1, 1, 4, 3]);
    expect(dag.outputs["readback-job-state"]).toEqual([0, 2, 0, 0]);
    expect(dag.outputs["readback-enqueue-status"]).toEqual([1]);
    expect(dag.outputs["readback-dequeue-status"]).toEqual([1]);
  });
});
