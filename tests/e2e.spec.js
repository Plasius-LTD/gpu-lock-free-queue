import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

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
