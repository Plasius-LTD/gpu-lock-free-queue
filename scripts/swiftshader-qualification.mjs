const REQUIRED_WEBGPU_ADAPTER_ARGUMENT = "--use-webgpu-adapter=swiftshader";
const REQUIRED_VULKAN_ARGUMENT = "--use-vulkan=swiftshader";

export const CHROMIUM_SWIFTSHADER_ARGS = Object.freeze([
  "--enable-automation",
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan",
  "--use-angle=swiftshader",
  REQUIRED_VULKAN_ARGUMENT,
  REQUIRED_WEBGPU_ADAPTER_ARGUMENT,
  "--disable-vulkan-surface",
]);

function hasEnabledFeature(browserArguments, requiredFeature) {
  return browserArguments.some((argument) => {
    if (!argument.startsWith("--enable-features=")) return false;
    return argument
      .slice("--enable-features=".length)
      .split(",")
      .map((feature) => feature.split("<", 1)[0])
      .includes(requiredFeature);
  });
}

export function validateSwiftShaderRuntime({ browserArguments, adapterInfo }) {
  if (!Array.isArray(browserArguments)) {
    return { ok: false, reason: "browser-command-line-unavailable" };
  }
  if (!browserArguments.includes(REQUIRED_WEBGPU_ADAPTER_ARGUMENT)) {
    return { ok: false, reason: "swiftshader-webgpu-flag-missing" };
  }
  if (!browserArguments.includes(REQUIRED_VULKAN_ARGUMENT)) {
    return { ok: false, reason: "swiftshader-vulkan-flag-missing" };
  }
  if (!hasEnabledFeature(browserArguments, "Vulkan")) {
    return { ok: false, reason: "vulkan-feature-flag-missing" };
  }
  if (adapterInfo?.isFallbackAdapter !== true) {
    return {
      ok: false,
      reason: "swiftshader-fallback-adapter-not-confirmed",
      info: adapterInfo ?? null,
    };
  }
  return { ok: true };
}
