import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.js"],
    format: ["esm"],
    target: "es2022",
    sourcemap: true,
    clean: true,
    dts: false,
  },
  {
    entry: ["src/index.cjs"],
    format: ["cjs"],
    target: "es2022",
    sourcemap: true,
    clean: false,
    dts: false,
  },
]);
