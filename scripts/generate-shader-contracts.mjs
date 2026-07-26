#!/usr/bin/env node

import { readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeGpuContract,
  computeGpuAbiHash,
  computeShaderManifestCoreSha256,
  computeSha256,
  createGpuRecordCodec,
  parseShaderVersionManifestCore,
} from "@plasius/gpu-shader";
import {
  admitQualificationBundle,
  analyzeWgslSource,
  reflectGpuInterface,
} from "@plasius/gpu-shader/node";
import {
  validateCompileUnitInventory,
  validateQualificationFixture,
  validateStableWebGpuMatrix,
} from "@plasius/gpu-shader/testing";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qualificationRoot = path.join(projectRoot, "qualification");
const distQualificationRoot = path.join(projectRoot, "dist", "qualification");
const encoder = new TextEncoder();

const SHADER_COMPILE_UNIT_VERSION = "1.0.0";
const SHADER_QUALIFICATION_BUNDLE_VERSION = "1.0.0";
const SHADER_QUALIFICATION_FIXTURE_VERSION = "1.0.0";
const SHADER_VERSION_MANIFEST_VERSION = "1.0.0";
const MODEL_COMPATIBILITY_FIXTURE_VERSION = "1.0.0";

const shaderDefinitions = Object.freeze([
  Object.freeze({
    kind: "flat",
    sourcePath: "src/queue.wgsl",
    moduleFile: "queue.wgsl",
    moduleId: "flat-queue",
    interfaceId: "gpu-lock-free-queue.flat",
    shaderId: "gpu-lock-free-queue.flat",
    compileUnitId: "queue.flat.v1",
    fixtureId: "queue.flat.semantic.v1",
    entryPoints: Object.freeze([
      Object.freeze({ name: "enqueue_main", pipelineId: "flat.enqueue", bindings: Object.freeze([0, 1, 2, 4, 6, 7]) }),
      Object.freeze({ name: "dequeue_main", pipelineId: "flat.dequeue", bindings: Object.freeze([0, 1, 3, 4, 5, 6, 7]) }),
    ]),
    modelFacingBindings: Object.freeze([
      Object.freeze({ group: 0, binding: 0, semantic: "queue.header" }),
      Object.freeze({ group: 0, binding: 7, semantic: "queue.params" }),
    ]),
    semantics: Object.freeze([
      Object.freeze({ semantic: "queue.header", source: Object.freeze({ kind: "binding", group: 0, binding: 0 }) }),
      Object.freeze({ semantic: "queue.params", source: Object.freeze({ kind: "binding", group: 0, binding: 7 }) }),
      Object.freeze({ semantic: "queue.job-type", source: Object.freeze({ kind: "record-member", recordName: "JobMeta", memberPath: Object.freeze(["job_type"]) }) }),
      Object.freeze({ semantic: "queue.payload-offset", source: Object.freeze({ kind: "record-member", recordName: "JobMeta", memberPath: Object.freeze(["payload_offset"]) }) }),
      Object.freeze({ semantic: "queue.payload-words", source: Object.freeze({ kind: "record-member", recordName: "JobMeta", memberPath: Object.freeze(["payload_words"]) }) }),
    ]),
    limits: Object.freeze([
      Object.freeze({ name: "maxBindGroups", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxBindingsPerBindGroup", comparator: "at-least", value: 8 }),
      Object.freeze({ name: "maxStorageBuffersPerShaderStage", comparator: "at-least", value: 6 }),
      Object.freeze({ name: "maxUniformBuffersPerShaderStage", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxBufferSize", comparator: "at-least", value: 64 }),
      Object.freeze({ name: "maxStorageBufferBindingSize", comparator: "at-least", value: 64 }),
      Object.freeze({ name: "maxUniformBufferBindingSize", comparator: "at-least", value: 16 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeX", comparator: "at-least", value: 64 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeY", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeZ", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxComputeInvocationsPerWorkgroup", comparator: "at-least", value: 64 }),
    ]),
  }),
  Object.freeze({
    kind: "demo",
    sourcePath: "demo/queue.wgsl",
    moduleFile: "queue.wgsl",
    moduleId: "demo-queue",
    interfaceId: "gpu-lock-free-queue.demo",
    shaderId: "gpu-lock-free-queue.demo",
    compileUnitId: "queue.demo.v1",
    fixtureId: "queue.demo.semantic.v1",
    entryPoints: Object.freeze([
      Object.freeze({ name: "enqueue_main", pipelineId: "demo.enqueue", bindings: Object.freeze([0, 1, 2, 4, 6, 7]) }),
      Object.freeze({ name: "dequeue_main", pipelineId: "demo.dequeue", bindings: Object.freeze([0, 1, 3, 4, 5, 6, 7]) }),
    ]),
    modelFacingBindings: Object.freeze([
      Object.freeze({ group: 0, binding: 0, semantic: "queue.header" }),
      Object.freeze({ group: 0, binding: 7, semantic: "queue.params" }),
    ]),
    semantics: Object.freeze([
      Object.freeze({ semantic: "queue.header", source: Object.freeze({ kind: "binding", group: 0, binding: 0 }) }),
      Object.freeze({ semantic: "queue.params", source: Object.freeze({ kind: "binding", group: 0, binding: 7 }) }),
      Object.freeze({ semantic: "queue.job-type", source: Object.freeze({ kind: "record-member", recordName: "JobMeta", memberPath: Object.freeze(["job_type"]) }) }),
      Object.freeze({ semantic: "queue.payload-offset", source: Object.freeze({ kind: "record-member", recordName: "JobMeta", memberPath: Object.freeze(["payload_offset"]) }) }),
      Object.freeze({ semantic: "queue.payload-words", source: Object.freeze({ kind: "record-member", recordName: "JobMeta", memberPath: Object.freeze(["payload_words"]) }) }),
    ]),
    limits: Object.freeze([
      Object.freeze({ name: "maxBindGroups", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxBindingsPerBindGroup", comparator: "at-least", value: 8 }),
      Object.freeze({ name: "maxStorageBuffersPerShaderStage", comparator: "at-least", value: 6 }),
      Object.freeze({ name: "maxUniformBuffersPerShaderStage", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxBufferSize", comparator: "at-least", value: 64 }),
      Object.freeze({ name: "maxStorageBufferBindingSize", comparator: "at-least", value: 64 }),
      Object.freeze({ name: "maxUniformBufferBindingSize", comparator: "at-least", value: 16 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeX", comparator: "at-least", value: 64 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeY", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeZ", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxComputeInvocationsPerWorkgroup", comparator: "at-least", value: 64 }),
    ]),
  }),
  Object.freeze({
    kind: "dag",
    sourcePath: "src/dag-queue.wgsl",
    moduleFile: "dag-queue.wgsl",
    moduleId: "dag-queue",
    interfaceId: "gpu-lock-free-queue.dag",
    shaderId: "gpu-lock-free-queue.dag",
    compileUnitId: "queue.dag.v1",
    fixtureId: "queue.dag.semantic.v1",
    entryPoints: Object.freeze([
      Object.freeze({ name: "enqueue_main", pipelineId: "dag.enqueue", bindings: Object.freeze([0, 1, 2, 3, 8, 9]) }),
      Object.freeze({ name: "dequeue_main", pipelineId: "dag.dequeue", bindings: Object.freeze([0, 1, 2, 5, 6, 7, 8, 9]) }),
    ]),
    modelFacingBindings: Object.freeze([
      Object.freeze({ group: 0, binding: 9, semantic: "queue.params" }),
    ]),
    semantics: Object.freeze([
      Object.freeze({ semantic: "queue.params", source: Object.freeze({ kind: "binding", group: 0, binding: 9 }) }),
      Object.freeze({ semantic: "queue.node-index", source: Object.freeze({ kind: "record-member", recordName: "JobDesc", memberPath: Object.freeze(["node_index"]) }) }),
      Object.freeze({ semantic: "queue.job-type", source: Object.freeze({ kind: "record-member", recordName: "JobDesc", memberPath: Object.freeze(["job_type"]) }) }),
      Object.freeze({ semantic: "queue.priority", source: Object.freeze({ kind: "record-member", recordName: "JobDesc", memberPath: Object.freeze(["priority"]) }) }),
      Object.freeze({ semantic: "queue.payload-offset", source: Object.freeze({ kind: "record-member", recordName: "JobDesc", memberPath: Object.freeze(["payload_offset"]) }) }),
      Object.freeze({ semantic: "queue.payload-words", source: Object.freeze({ kind: "record-member", recordName: "JobDesc", memberPath: Object.freeze(["payload_words"]) }) }),
      Object.freeze({ semantic: "queue.dependency-count", source: Object.freeze({ kind: "record-member", recordName: "JobNode", memberPath: Object.freeze(["dependency_count"]) }) }),
    ]),
    limits: Object.freeze([
      Object.freeze({ name: "maxBindGroups", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxBindingsPerBindGroup", comparator: "at-least", value: 10 }),
      Object.freeze({ name: "maxStorageBuffersPerShaderStage", comparator: "at-least", value: 7 }),
      Object.freeze({ name: "maxUniformBuffersPerShaderStage", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxBufferSize", comparator: "at-least", value: 128 }),
      Object.freeze({ name: "maxStorageBufferBindingSize", comparator: "at-least", value: 128 }),
      Object.freeze({ name: "maxUniformBufferBindingSize", comparator: "at-least", value: 16 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeX", comparator: "at-least", value: 64 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeY", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxComputeWorkgroupSizeZ", comparator: "at-least", value: 1 }),
      Object.freeze({ name: "maxComputeInvocationsPerWorkgroup", comparator: "at-least", value: 64 }),
    ]),
  }),
]);

function jsonBytes(value) {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function u32Bytes(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

function bytesFromCodec(manifest, recordName, value) {
  const record = manifest.records.find((candidate) => candidate.name === recordName);
  if (!record) {
    throw new Error(`Reflected record ${recordName} is missing.`);
  }
  return new Uint8Array(createGpuRecordCodec(record, manifest.records).encode(value));
}

function normalizedSemantics(definition) {
  return definition.semantics.map((projection) => projection.source.kind === "binding"
    ? {
        semantic: projection.semantic,
        source: {
          ...projection.source,
          moduleId: definition.moduleId,
        },
      }
    : projection);
}

function createPipelines(definition, analysis) {
  const resources = new Map(analysis.bindings.map((binding) => [binding.binding, binding.resource]));
  return definition.entryPoints.map((entryPoint) => ({
    kind: "compute",
    pipelineId: entryPoint.pipelineId,
    layout: {
      bindGroups: [{
        group: 0,
        entries: entryPoint.bindings.map((binding) => {
          const resource = resources.get(binding);
          if (!resource) {
            throw new Error(`${definition.moduleId} does not declare binding 0:${binding}.`);
          }
          return {
            group: 0,
            binding,
            resource,
            visibility: ["compute"],
          };
        }),
      }],
    },
    compute: {
      moduleId: definition.moduleId,
      entryPoint: entryPoint.name,
      constants: {},
    },
  }));
}

async function addDataFile(files, bundleKind, name, bytes) {
  const relativePath = `${bundleKind}/data/${name}.bin`;
  files.set(relativePath, bytes);
  return {
    path: `data/${name}.bin`,
    sha256: await computeSha256(bytes),
  };
}

function bufferResource(resourceId, byteLength, usage, initialData = null) {
  return { kind: "buffer", resourceId, byteLength, usage, initialData };
}

function bindGroupEntry(binding, resourceId, size) {
  return {
    binding,
    resource: { kind: "buffer", resourceId, offset: 0, size },
  };
}

async function readback(resourceId, byteLength, expectedBytes) {
  return {
    resourceId,
    byteOffset: 0,
    byteLength,
    expectedSha256: await computeSha256(expectedBytes),
  };
}

function copyToReadback(source, destination, byteLength) {
  return { kind: "copy-buffer", source, destination, byteLength };
}

function pipelineIdFor(definition, entryPointName) {
  const entryPoint = definition.entryPoints.find(({ name }) => name === entryPointName);
  if (!entryPoint) {
    throw new Error(`${definition.compileUnitId} does not declare ${entryPointName}.`);
  }
  return entryPoint.pipelineId;
}

async function createFlatFixture(definition, manifest, files) {
  const enqueuePipelineId = pipelineIdFor(definition, "enqueue_main");
  const dequeuePipelineId = pipelineIdFor(definition, "dequeue_main");
  const queueInitialValue = { head: 0, tail: 0, capacity: 4, mask: 3 };
  const queueExpectedValue = { head: 1, tail: 1, capacity: 4, mask: 3 };
  const paramsValue = { job_count: 1, output_stride: 2, padding: [0, 0] };
  const outputJobValue = { job_type: 7, payload_offset: 0, payload_words: 2, padding: 0 };
  const queueInitial = bytesFromCodec(manifest, "Queue", queueInitialValue);
  const slotsInitial = u32Bytes([
    0, 0, 0, 0,
    1, 0, 0, 0,
    2, 0, 0, 0,
    3, 0, 0, 0,
  ]);
  const inputJobs = bytesFromCodec(manifest, "JobMeta", outputJobValue);
  const inputPayloads = u32Bytes([42, 99]);
  const params = bytesFromCodec(manifest, "Params", paramsValue);
  const queueExpected = bytesFromCodec(manifest, "Queue", queueExpectedValue);
  const outputJobExpected = bytesFromCodec(manifest, "JobMeta", outputJobValue);
  const outputPayloadExpected = u32Bytes([42, 99]);
  const statusExpected = u32Bytes([1]);

  const [queueData, slotsData, jobsData, payloadData, paramsData] = await Promise.all([
    addDataFile(files, definition.kind, "queue", queueInitial),
    addDataFile(files, definition.kind, "slots", slotsInitial),
    addDataFile(files, definition.kind, "input-jobs", inputJobs),
    addDataFile(files, definition.kind, "input-payloads", inputPayloads),
    addDataFile(files, definition.kind, "params", params),
  ]);

  const resources = [
    bufferResource("queue", 16, ["storage", "copy-src", "copy-dst"], queueData),
    bufferResource("slots", 64, ["storage", "copy-dst"], slotsData),
    bufferResource("input-jobs", 16, ["storage", "copy-dst"], jobsData),
    bufferResource("output-jobs", 16, ["storage", "copy-src"]),
    bufferResource("input-payloads", 8, ["storage", "copy-dst"], payloadData),
    bufferResource("output-payloads", 8, ["storage", "copy-src"]),
    bufferResource("enqueue-status", 4, ["storage", "copy-src"]),
    bufferResource("dequeue-status", 4, ["storage", "copy-src"]),
    bufferResource("params", 16, ["uniform", "copy-dst"], paramsData),
    bufferResource("readback-queue", 16, ["map-read", "copy-dst"]),
    bufferResource("readback-output-job", 16, ["map-read", "copy-dst"]),
    bufferResource("readback-output-payload", 8, ["map-read", "copy-dst"]),
    bufferResource("readback-enqueue-status", 4, ["map-read", "copy-dst"]),
    bufferResource("readback-dequeue-status", 4, ["map-read", "copy-dst"]),
  ];

  const enqueueGroup = {
    bindGroupId: `${enqueuePipelineId}.group0`,
    group: 0,
    entries: [
      bindGroupEntry(0, "queue", 16),
      bindGroupEntry(1, "slots", 64),
      bindGroupEntry(2, "input-jobs", 16),
      bindGroupEntry(4, "input-payloads", 8),
      bindGroupEntry(6, "enqueue-status", 4),
      bindGroupEntry(7, "params", 16),
    ],
  };
  const dequeueGroup = {
    bindGroupId: `${dequeuePipelineId}.group0`,
    group: 0,
    entries: [
      bindGroupEntry(0, "queue", 16),
      bindGroupEntry(1, "slots", 64),
      bindGroupEntry(3, "output-jobs", 16),
      bindGroupEntry(4, "input-payloads", 8),
      bindGroupEntry(5, "output-payloads", 8),
      bindGroupEntry(6, "dequeue-status", 4),
      bindGroupEntry(7, "params", 16),
    ],
  };
  const commands = [
    { kind: "dispatch", pipelineId: enqueuePipelineId, bindGroupIds: [enqueueGroup.bindGroupId], workgroups: [1, 1, 1] },
    { kind: "dispatch", pipelineId: dequeuePipelineId, bindGroupIds: [dequeueGroup.bindGroupId], workgroups: [1, 1, 1] },
    copyToReadback("queue", "readback-queue", 16),
    copyToReadback("output-jobs", "readback-output-job", 16),
    copyToReadback("output-payloads", "readback-output-payload", 8),
    copyToReadback("enqueue-status", "readback-enqueue-status", 4),
    copyToReadback("dequeue-status", "readback-dequeue-status", 4),
  ];
  const readbacks = await Promise.all([
    readback("readback-queue", 16, queueExpected),
    readback("readback-output-job", 16, outputJobExpected),
    readback("readback-output-payload", 8, outputPayloadExpected),
    readback("readback-enqueue-status", 4, statusExpected),
    readback("readback-dequeue-status", 4, statusExpected),
  ]);

  return {
    contractVersion: SHADER_QUALIFICATION_FIXTURE_VERSION,
    fixtureId: definition.fixtureId,
    resources,
    bindGroups: [enqueueGroup, dequeueGroup],
    commands,
    layoutProbes: [
      {
        kind: "buffer-record",
        probeId: `${definition.kind}.queue-header-roundtrip`,
        source: { moduleId: definition.moduleId, group: 0, binding: 0, recordName: "Queue" },
        pipelineId: enqueuePipelineId,
        commandIndex: 0,
        input: { resourceId: "queue", byteOffset: 0, byteLength: 16, value: queueInitialValue },
        output: { readbackIndex: 0, recordName: "Queue", expectedValue: queueExpectedValue },
      },
      {
        kind: "buffer-record",
        probeId: `${definition.kind}.params-to-job-roundtrip`,
        source: { moduleId: definition.moduleId, group: 0, binding: 7, recordName: "Params" },
        pipelineId: dequeuePipelineId,
        commandIndex: 1,
        input: { resourceId: "params", byteOffset: 0, byteLength: 16, value: paramsValue },
        output: { readbackIndex: 1, recordName: "JobMeta", expectedValue: outputJobValue },
      },
    ],
    readbacks,
    bounds: {
      maxBufferBytes: resources.reduce((total, resource) => total + resource.byteLength, 0),
      maxTextureTexels: 1,
      maxCommands: commands.length,
      timeoutMs: 30_000,
    },
  };
}

async function createDagFixture(definition, manifest, files) {
  const paramsValue = { job_count: 1, output_stride: 2, ready_queue_count: 2, max_priority: 1 };
  const outputJobValue = {
    node_index: 0,
    job_type: 11,
    priority: 1,
    payload_offset: 0,
    payload_words: 2,
    padding: [0, 0, 0],
  };
  const readyQueuesInitial = u32Bytes([0, 0, 4, 3, 0, 0, 4, 3]);
  const readySlotsInitial = u32Bytes([
    0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0,
    0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0,
  ]);
  const jobNodeInitial = bytesFromCodec(manifest, "JobNode", {
    job_type: 11,
    priority: 1,
    payload_offset: 0,
    payload_words: 2,
    dependency_offset: 0,
    dependency_count: 0,
    dependent_offset: 0,
    dependent_count: 0,
  });
  const inputPayloads = u32Bytes([101, 202]);
  const params = bytesFromCodec(manifest, "Params", paramsValue);
  const outputJobExpected = bytesFromCodec(manifest, "JobDesc", outputJobValue);
  const outputPayloadExpected = u32Bytes([101, 202]);
  const statusExpected = u32Bytes([1]);
  const readyQueuesExpected = u32Bytes([0, 0, 4, 3, 1, 1, 4, 3]);
  const jobStateExpected = bytesFromCodec(manifest, "JobState", {
    unresolved: 0,
    state: 2,
    padding: [0, 0],
  });

  const [readyQueuesData, readySlotsData, jobNodeData, payloadData, paramsData, dependentsData] = await Promise.all([
    addDataFile(files, definition.kind, "ready-queues", readyQueuesInitial),
    addDataFile(files, definition.kind, "ready-slots", readySlotsInitial),
    addDataFile(files, definition.kind, "job-nodes", jobNodeInitial),
    addDataFile(files, definition.kind, "input-payloads", inputPayloads),
    addDataFile(files, definition.kind, "params", params),
    addDataFile(files, definition.kind, "job-dependents", u32Bytes([0])),
  ]);

  const resources = [
    bufferResource("ready-queues", 32, ["storage", "copy-src", "copy-dst"], readyQueuesData),
    bufferResource("ready-slots", 128, ["storage", "copy-dst"], readySlotsData),
    bufferResource("job-nodes", 32, ["storage", "copy-dst"], jobNodeData),
    bufferResource("job-states", 16, ["storage", "copy-src"]),
    bufferResource("job-dependents", 4, ["storage", "copy-dst"], dependentsData),
    bufferResource("output-jobs", 48, ["storage", "copy-src"]),
    bufferResource("input-payloads", 8, ["storage", "copy-dst"], payloadData),
    bufferResource("output-payloads", 8, ["storage", "copy-src"]),
    bufferResource("enqueue-status", 4, ["storage", "copy-src"]),
    bufferResource("dequeue-status", 4, ["storage", "copy-src"]),
    bufferResource("params", 16, ["uniform", "copy-dst"], paramsData),
    bufferResource("readback-ready-queues", 32, ["map-read", "copy-dst"]),
    bufferResource("readback-job-state", 16, ["map-read", "copy-dst"]),
    bufferResource("readback-output-job", 48, ["map-read", "copy-dst"]),
    bufferResource("readback-output-payload", 8, ["map-read", "copy-dst"]),
    bufferResource("readback-enqueue-status", 4, ["map-read", "copy-dst"]),
    bufferResource("readback-dequeue-status", 4, ["map-read", "copy-dst"]),
  ];

  const enqueueGroup = {
    bindGroupId: "dag.enqueue.group0",
    group: 0,
    entries: [
      bindGroupEntry(0, "ready-queues", 32),
      bindGroupEntry(1, "ready-slots", 128),
      bindGroupEntry(2, "job-nodes", 32),
      bindGroupEntry(3, "job-states", 16),
      bindGroupEntry(8, "enqueue-status", 4),
      bindGroupEntry(9, "params", 16),
    ],
  };
  const dequeueGroup = {
    bindGroupId: "dag.dequeue.group0",
    group: 0,
    entries: [
      bindGroupEntry(0, "ready-queues", 32),
      bindGroupEntry(1, "ready-slots", 128),
      bindGroupEntry(2, "job-nodes", 32),
      bindGroupEntry(5, "output-jobs", 48),
      bindGroupEntry(6, "input-payloads", 8),
      bindGroupEntry(7, "output-payloads", 8),
      bindGroupEntry(8, "dequeue-status", 4),
      bindGroupEntry(9, "params", 16),
    ],
  };
  const commands = [
    { kind: "dispatch", pipelineId: "dag.enqueue", bindGroupIds: [enqueueGroup.bindGroupId], workgroups: [1, 1, 1] },
    { kind: "dispatch", pipelineId: "dag.dequeue", bindGroupIds: [dequeueGroup.bindGroupId], workgroups: [1, 1, 1] },
    copyToReadback("ready-queues", "readback-ready-queues", 32),
    copyToReadback("job-states", "readback-job-state", 16),
    copyToReadback("output-jobs", "readback-output-job", 48),
    copyToReadback("output-payloads", "readback-output-payload", 8),
    copyToReadback("enqueue-status", "readback-enqueue-status", 4),
    copyToReadback("dequeue-status", "readback-dequeue-status", 4),
  ];
  const readbacks = await Promise.all([
    readback("readback-ready-queues", 32, readyQueuesExpected),
    readback("readback-job-state", 16, jobStateExpected),
    readback("readback-output-job", 48, outputJobExpected),
    readback("readback-output-payload", 8, outputPayloadExpected),
    readback("readback-enqueue-status", 4, statusExpected),
    readback("readback-dequeue-status", 4, statusExpected),
  ]);

  return {
    contractVersion: SHADER_QUALIFICATION_FIXTURE_VERSION,
    fixtureId: definition.fixtureId,
    resources,
    bindGroups: [enqueueGroup, dequeueGroup],
    commands,
    layoutProbes: [{
      kind: "buffer-record",
      probeId: "dag.params-to-job-roundtrip",
      source: { moduleId: definition.moduleId, group: 0, binding: 9, recordName: "Params" },
      pipelineId: "dag.dequeue",
      commandIndex: 1,
      input: { resourceId: "params", byteOffset: 0, byteLength: 16, value: paramsValue },
      output: { readbackIndex: 2, recordName: "JobDesc", expectedValue: outputJobValue },
    }],
    readbacks,
    bounds: {
      maxBufferBytes: resources.reduce((total, resource) => total + resource.byteLength, 0),
      maxTextureTexels: 1,
      maxCommands: commands.length,
      timeoutMs: 30_000,
    },
  };
}

function createInterfaceRef(definition, manifestSha256, manifest) {
  return {
    interfaceId: manifest.interfaceId,
    interfaceVersion: manifest.interfaceVersion,
    manifestUri: `https://assets.plasius.co.uk/gpu-interfaces/${definition.interfaceId}/1.0.0/manifest.json`,
    manifestSha256,
    interfaceAbiHash: manifest.interfaceAbiHash,
    modelAbiHash: manifest.modelAbiHash,
  };
}

function createCompileUnit(definition, moduleSha256, pipelines, interfaceRef, fixtureSha256, paths) {
  return {
    contractVersion: SHADER_COMPILE_UNIT_VERSION,
    compileUnitId: definition.compileUnitId,
    fragmentIds: [definition.moduleId],
    modules: [{
      moduleId: definition.moduleId,
      sha256: moduleSha256,
      assembly: { kind: "concat-v1", fragmentIds: [definition.moduleId] },
    }],
    entryPoints: definition.entryPoints.map((entryPoint) => ({
      moduleId: definition.moduleId,
      name: entryPoint.name,
      stage: "compute",
    })),
    pipelines,
    interfaceRef,
    overrideValues: {},
    qualificationFixture: {
      fixtureId: definition.fixtureId,
      path: paths.fixture,
      sha256: fixtureSha256,
    },
  };
}

async function buildShaderBundle(definition, matrix, files) {
  const source = await readFile(path.join(projectRoot, definition.sourcePath), "utf8");
  const sourceBytes = encoder.encode(source);
  const moduleSha256 = await computeSha256(sourceBytes);
  const analysis = analyzeWgslSource(source, definition.moduleId);
  const discoveredEntryPoints = analysis.ast.flatMap((node) => {
    const stages = (node.attributes ?? [])
      .map((attribute) => attribute.name)
      .filter((name) => name === "compute" || name === "vertex" || name === "fragment");
    return stages.map((stage) => `${stage}:${node.name}`);
  }).sort();
  const declaredEntryPoints = definition.entryPoints
    .map((entryPoint) => `compute:${entryPoint.name}`)
    .sort();
  if (discoveredEntryPoints.join("\n") !== declaredEntryPoints.join("\n")) {
    throw new Error(
      `${definition.sourcePath} entry-point inventory is incomplete. `
      + `Discovered ${discoveredEntryPoints.join(", ") || "none"}; `
      + `declared ${declaredEntryPoints.join(", ") || "none"}.`,
    );
  }
  const pipelines = createPipelines(definition, analysis);
  const semantics = normalizedSemantics(definition);
  const gpuInterface = await reflectGpuInterface({
    interfaceId: definition.interfaceId,
    interfaceVersion: "1.0.0",
    modules: [{ moduleId: definition.moduleId, source }],
    pipelines,
    modelFacingRecordNames: analysis.records.map((record) => record.name),
    modelFacingBindings: definition.modelFacingBindings.map((binding) => ({
      moduleId: definition.moduleId,
      ...binding,
    })),
    semantics,
  });
  const interfaceBytes = jsonBytes(gpuInterface);
  const interfaceSha256 = await computeSha256(interfaceBytes);
  const interfaceRef = createInterfaceRef(definition, interfaceSha256, gpuInterface);
  const fixture = definition.kind === "dag"
    ? await createDagFixture(definition, gpuInterface, files)
    : await createFlatFixture(definition, gpuInterface, files);
  const fixtureBytes = jsonBytes(fixture);
  const fixtureSha256 = await computeSha256(fixtureBytes);

  const bundleUnit = createCompileUnit(
    definition,
    moduleSha256,
    pipelines,
    interfaceRef,
    fixtureSha256,
    { fixture: "fixtures/fixture.json" },
  );
  const inventory = {
    contractVersion: SHADER_COMPILE_UNIT_VERSION,
    fragments: [{ fragmentId: definition.moduleId, path: `fragments/${definition.moduleFile}`, sha256: moduleSha256 }],
    compileUnits: [bundleUnit],
  };
  const inventoryResult = validateCompileUnitInventory(inventory);
  if (!inventoryResult.ok) {
    throw new Error(inventoryResult.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  }
  const fixtureResult = validateQualificationFixture(fixture, bundleUnit);
  if (!fixtureResult.ok) {
    throw new Error(fixtureResult.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  }

  const requirements = {
    semantics: semantics.map((projection) => projection.semantic).sort(),
    features: [],
    limits: [...definition.limits].sort((left, right) => left.name.localeCompare(right.name, "en")),
    formats: [],
  };
  const shaderAbiHash = await computeGpuAbiHash({
    kind: "shader",
    interface: gpuInterface,
    pipelines,
    requirements,
  });
  const shaderCore = {
    contractVersion: SHADER_VERSION_MANIFEST_VERSION,
    shaderId: definition.shaderId,
    version: "1.0.0",
    modules: [{
      moduleId: definition.moduleId,
      uri: `https://assets.plasius.co.uk/shaders/${definition.shaderId}/1.0.0/${definition.moduleFile}`,
      byteLength: sourceBytes.byteLength,
      sha256: moduleSha256,
      contentType: "text/wgsl; charset=utf-8",
    }],
    gpuInterface: interfaceRef,
    pipelines,
    renderRoles: [{ role: "post-processing", pipelineIds: pipelines.map((pipeline) => pipeline.pipelineId) }],
    compatibleModelInterfaces: [{
      interfaceId: interfaceRef.interfaceId,
      interfaceVersion: interfaceRef.interfaceVersion,
      manifestSha256: interfaceRef.manifestSha256,
      interfaceAbiHash: interfaceRef.interfaceAbiHash,
      modelAbiHash: interfaceRef.modelAbiHash,
    }],
    requirements,
    shaderAbiHash,
  };
  parseShaderVersionManifestCore(shaderCore);
  const shaderCoreBytes = jsonBytes(shaderCore);
  const shaderCoreSha256 = await computeShaderManifestCoreSha256(shaderCore);
  const modelCompatibility = {
    contractVersion: MODEL_COMPATIBILITY_FIXTURE_VERSION,
    fixtureId: `${definition.kind}.queue-model.v1`,
    model: {
      modelId: `${definition.shaderId}.qualification-model`,
      version: "1.0.0",
      gpuInterface: interfaceRef,
      modelAbiHash: interfaceRef.modelAbiHash,
      providedSemantics: requirements.semantics,
      defaultStyleProfile: null,
    },
  };
  const modelCompatibilityBytes = jsonBytes(modelCompatibility);
  const modelCompatibilitySha256 = await computeSha256(modelCompatibilityBytes);
  const compileUnitInventorySha256 = await computeSha256(canonicalizeGpuContract(inventory));
  const qualification = {
    contractVersion: SHADER_QUALIFICATION_BUNDLE_VERSION,
    inventory,
    subject: {
      shaderManifestCore: {
        shaderId: shaderCore.shaderId,
        version: shaderCore.version,
        sha256: shaderCoreSha256,
      },
      compileUnitInventorySha256,
      shaderAbiHash,
      interfaceManifestSha256: interfaceSha256,
      modelAbiHashes: [interfaceRef.modelAbiHash],
      modules: [{ moduleId: definition.moduleId, sha256: moduleSha256 }],
      requiredCompileUnitIds: [definition.compileUnitId],
      requiredCellIds: matrix.cells.map((cell) => cell.cellId),
    },
    shaderManifestCorePath: "manifests/shader-core.json",
    gpuInterfaceManifest: { path: "manifests/gpu-interface.json", sha256: interfaceSha256 },
    modelCompatibilityFixtures: [{
      fixtureId: modelCompatibility.fixtureId,
      path: "fixtures/model-compatibility.json",
      sha256: modelCompatibilitySha256,
    }],
    modules: [{ moduleId: definition.moduleId, path: `modules/${definition.moduleFile}`, sha256: moduleSha256 }],
    fixtures: [{
      fixtureId: definition.fixtureId,
      path: "fixtures/fixture.json",
      sha256: fixtureSha256,
      kind: "qualification-fixture",
    }],
  };

  files.set(`${definition.kind}/fragments/${definition.moduleFile}`, sourceBytes);
  files.set(`${definition.kind}/modules/${definition.moduleFile}`, sourceBytes);
  files.set(`${definition.kind}/manifests/gpu-interface.json`, interfaceBytes);
  files.set(`${definition.kind}/manifests/shader-core.json`, shaderCoreBytes);
  files.set(`${definition.kind}/fixtures/fixture.json`, fixtureBytes);
  files.set(`${definition.kind}/fixtures/model-compatibility.json`, modelCompatibilityBytes);
  files.set(`${definition.kind}/qualification.json`, jsonBytes(qualification));

  return {
    definition,
    sourceBytes,
    moduleSha256,
    pipelines,
    interfaceRef,
    fixtureSha256,
  };
}

async function stableMatrixBytes() {
  const packageJsonUrl = import.meta.resolve("@plasius/gpu-shader/package.json");
  const packageDirectory = path.dirname(fileURLToPath(packageJsonUrl));
  return new Uint8Array(await readFile(path.join(packageDirectory, "matrices", "stable-webgpu-2026-07-13.json")));
}

async function discoverShaderSources(directory, prefix) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const discovered = [];
  for (const entry of entries) {
    const relative = `${prefix}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) discovered.push(...await discoverShaderSources(absolute, relative));
    else if (entry.isFile() && entry.name.endsWith(".wgsl")) discovered.push(relative);
    else if (!entry.isFile()) throw new Error(`Shader source tree contains a non-regular entry: ${relative}`);
  }
  return discovered;
}

async function expectedFiles() {
  const files = new Map();
  const matrixBytes = await stableMatrixBytes();
  const matrix = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(matrixBytes));
  const matrixResult = validateStableWebGpuMatrix(matrix);
  if (!matrixResult.ok) {
    throw new Error(matrixResult.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  }
  files.set("stable-webgpu-matrix.json", matrixBytes);

  const bundles = [];
  for (const definition of shaderDefinitions) {
    bundles.push(await buildShaderBundle(definition, matrixResult.value, files));
  }
  const inventory = {
    contractVersion: SHADER_COMPILE_UNIT_VERSION,
    fragments: bundles.map((bundle) => ({
      fragmentId: bundle.definition.moduleId,
      path: bundle.definition.sourcePath,
      sha256: bundle.moduleSha256,
    })),
    compileUnits: bundles.map((bundle) => createCompileUnit(
      bundle.definition,
      bundle.moduleSha256,
      bundle.pipelines,
      bundle.interfaceRef,
      bundle.fixtureSha256,
      { fixture: `${bundle.definition.kind}/fixtures/fixture.json` },
    )),
  };
  const inventoryResult = validateCompileUnitInventory(inventory);
  if (!inventoryResult.ok) {
    throw new Error(inventoryResult.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  }
  const discoveredSourcePaths = [
    ...await discoverShaderSources(path.join(projectRoot, "src"), "src"),
    ...await discoverShaderSources(path.join(projectRoot, "demo"), "demo"),
  ].sort();
  const declaredSourcePaths = inventory.fragments.map((fragment) => fragment.path).sort();
  if (discoveredSourcePaths.join("\n") !== declaredSourcePaths.join("\n")) {
    throw new Error(
      `WGSL orphan discovery failed. Discovered ${discoveredSourcePaths.join(", ") || "none"}; `
      + `declared ${declaredSourcePaths.join(", ") || "none"}.`,
    );
  }
  files.set("inventory.json", jsonBytes(inventory));
  return files;
}

async function regularFiles(root, prefix = "") {
  const result = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return result;
    throw error;
  }
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await regularFiles(absolute, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Qualification output contains a non-regular entry: ${relative}`);
  }
  return result.sort();
}

function equalBytes(left, right) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

async function writeExpected(files) {
  for (const [relative, bytes] of files) {
    const destination = path.join(qualificationRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "w", mode: 0o644 });
  }
}

async function replaceDistQualification(files) {
  await rm(distQualificationRoot, { recursive: true, force: true });
  for (const [relative, bytes] of files) {
    const destination = path.join(distQualificationRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o644 });
  }
}

async function checkExpected(files) {
  const expectedNames = new Set(files.keys());
  const actualNames = await regularFiles(qualificationRoot);
  const unexpected = actualNames.filter((name) => !expectedNames.has(name));
  if (unexpected.length > 0) {
    throw new Error(`Qualification output contains undeclared files: ${unexpected.join(", ")}`);
  }
  for (const [relative, expected] of files) {
    let actual;
    try {
      actual = new Uint8Array(await readFile(path.join(qualificationRoot, relative)));
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Qualification output is missing ${relative}.`, { cause: error });
      }
      throw error;
    }
    if (!equalBytes(actual, expected)) {
      throw new Error(`Qualification output is stale: ${relative}. Run npm run shader:generate.`);
    }
  }
}

async function validateBundles() {
  for (const definition of shaderDefinitions) {
    await admitQualificationBundle(path.join(qualificationRoot, definition.kind));
  }
}

export async function generateShaderContracts(mode = "--check") {
  if (!["--check", "--write", "--copy-dist"].includes(mode)) {
    throw new Error(
      "Usage: node scripts/generate-shader-contracts.mjs [--check|--write|--copy-dist]",
    );
  }
  const files = await expectedFiles();
  if (mode === "--write") await writeExpected(files);
  await checkExpected(files);
  await validateBundles();
  if (mode === "--copy-dist") await replaceDistQualification(files);
  const action = mode === "--write"
    ? "generated and validated"
    : mode === "--copy-dist"
      ? "validated and copied"
      : "validated";
  process.stdout.write(`Shader contracts ${action} (${files.size} files).\n`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  generateShaderContracts(process.argv[2] ?? "--check").catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
