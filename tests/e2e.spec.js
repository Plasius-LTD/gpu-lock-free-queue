import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const testPatternSeed = 23;
const testPatternHash = "a6d54f1d";

function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === "/") {
      pathname = "/demo/index.html";
    }

    const fsPath = path.resolve(rootDir, pathname.slice(1));
    if (!fsPath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(fsPath)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const stat = fs.statSync(fsPath);
    if (stat.isDirectory()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(fsPath).toLowerCase();
    const contentTypes = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".wgsl": "text/plain",
      ".css": "text/css",
    };

    const contentType = contentTypes[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(fsPath).pipe(res);
  });
}

test.describe("demo", () => {
  let server;
  let baseUrl;

  test.beforeAll(async () => {
    server = createStaticServer(projectRoot);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  test.afterAll(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(() => resolve()));
  });

  test("demo page boots", async ({ page }) => {
    await page.goto(`${baseUrl}/demo/index.html`);

    const log = page.locator("#log");
    await page.waitForFunction(() => {
      const text = document.getElementById("log")?.textContent ?? "";
      return text.includes("WebGPU not available") || text.includes("Enqueued:");
    });

    const logText = await log.textContent();
    expect(logText).not.toContain("Validation error");
    expect(logText).not.toContain("Error:");
    expect(logText).toMatch(/WebGPU not available|Enqueued: \d+ \/ \d+/);
  });

  test("demo renders deterministic test image", async ({ page }) => {
    await page.goto(`${baseUrl}/demo/index.html?mode=pattern&seed=${testPatternSeed}`);
    await page.waitForFunction(() => window.__testImageReady === true);

    const hash = await page.evaluate(() => {
      const canvas = document.getElementById("spectrogram");
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 0x811c9dc5;
      for (let i = 0; i < data.length; i += 1) {
        h ^= data[i];
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, "0");
    });

    expect(hash).toBe(testPatternHash);
  });

  test("WGSL compiles when WebGPU is available", async ({ page }) => {
    await page.goto(`${baseUrl}/demo/index.html`);
    const hasGpu = await page.evaluate(() => Boolean(navigator.gpu));
    if (!hasGpu) {
      test.skip(true, "WebGPU not available");
    }

    const result = await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { ok: false, reason: "no-adapter", errors: [] };
      }
      const device = await adapter.requestDevice();
      const shaderCode = await fetch("../src/queue.wgsl").then((res) => res.text());
      const module = device.createShaderModule({ code: shaderCode });
      const info = await module.getCompilationInfo();
      const errors = info.messages
        .filter((msg) => msg.type === "error")
        .map((msg) => msg.message);
      return { ok: errors.length === 0, errors };
    });

    if (!result.ok && result.reason === "no-adapter") {
      test.skip(true, "No suitable GPU adapter found");
    }
    expect(result.errors).toEqual([]);
  });

  test("demo renders spectrogram canvas", async ({ page }) => {
    await page.goto(`${baseUrl}/demo/index.html`);
    const canvas = page.locator("#spectrogram");
    await expect(canvas).toBeVisible();

    const size = await canvas.evaluate((el) => ({
      width: el.width,
      height: el.height,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);

    await page.waitForFunction(() => {
      const logText = document.getElementById("log")?.textContent ?? "";
      return logText.includes("WebGPU not available") || logText.includes("Dequeued:");
    });
  });
});
