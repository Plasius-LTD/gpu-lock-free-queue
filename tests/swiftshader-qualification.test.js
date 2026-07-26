import assert from "node:assert/strict";
import test from "node:test";
import {
  CHROMIUM_SWIFTSHADER_ARGS,
  validateSwiftShaderRuntime,
} from "../scripts/swiftshader-qualification.mjs";

test("Chromium qualification selects SwiftShader for WebGPU explicitly", () => {
  assert.ok(CHROMIUM_SWIFTSHADER_ARGS.includes("--enable-automation"));
  assert.ok(CHROMIUM_SWIFTSHADER_ARGS.includes("--enable-features=Vulkan"));
  assert.ok(CHROMIUM_SWIFTSHADER_ARGS.includes("--use-angle=swiftshader"));
  assert.ok(CHROMIUM_SWIFTSHADER_ARGS.includes("--use-vulkan=swiftshader"));
  assert.ok(CHROMIUM_SWIFTSHADER_ARGS.includes("--use-webgpu-adapter=swiftshader"));
});

test("runtime validation accepts a forced SwiftShader fallback adapter", () => {
  assert.deepEqual(
    validateSwiftShaderRuntime({
      browserArguments: CHROMIUM_SWIFTSHADER_ARGS,
      adapterInfo: {
        vendor: "",
        architecture: "",
        device: "",
        description: "",
        isFallbackAdapter: true,
      },
    }),
    { ok: true },
  );
});

test("runtime validation fails closed when the browser flag is missing", () => {
  assert.deepEqual(
    validateSwiftShaderRuntime({
      browserArguments: CHROMIUM_SWIFTSHADER_ARGS.filter(
        (argument) => argument !== "--use-webgpu-adapter=swiftshader",
      ),
      adapterInfo: { isFallbackAdapter: true },
    }),
    {
      ok: false,
      reason: "swiftshader-webgpu-flag-missing",
    },
  );
});

test("runtime validation fails closed when Chromium's command line is unavailable", () => {
  assert.deepEqual(
    validateSwiftShaderRuntime({
      browserArguments: null,
      adapterInfo: { isFallbackAdapter: true },
    }),
    {
      ok: false,
      reason: "browser-command-line-unavailable",
    },
  );
});

test("runtime validation fails closed when SwiftShader Vulkan is not selected", () => {
  assert.deepEqual(
    validateSwiftShaderRuntime({
      browserArguments: CHROMIUM_SWIFTSHADER_ARGS.filter(
        (argument) => argument !== "--use-vulkan=swiftshader",
      ),
      adapterInfo: { isFallbackAdapter: true },
    }),
    {
      ok: false,
      reason: "swiftshader-vulkan-flag-missing",
    },
  );
});

test("runtime validation fails closed when Chromium Vulkan is not enabled", () => {
  assert.deepEqual(
    validateSwiftShaderRuntime({
      browserArguments: CHROMIUM_SWIFTSHADER_ARGS.filter(
        (argument) => argument !== "--enable-features=Vulkan",
      ),
      adapterInfo: { isFallbackAdapter: true },
    }),
    {
      ok: false,
      reason: "vulkan-feature-flag-missing",
    },
  );
});

test("runtime validation fails closed when Chromium does not expose a fallback adapter", () => {
  assert.deepEqual(
    validateSwiftShaderRuntime({
      browserArguments: CHROMIUM_SWIFTSHADER_ARGS,
      adapterInfo: { isFallbackAdapter: false },
    }),
    {
      ok: false,
      reason: "swiftshader-fallback-adapter-not-confirmed",
      info: { isFallbackAdapter: false },
    },
  );
});
