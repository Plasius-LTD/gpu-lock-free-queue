const { pathToFileURL, fileURLToPath } = require("node:url");
const { readFile } = require("node:fs/promises");

const queueWgslUrl = new URL("./queue.wgsl", pathToFileURL(__filename));

async function loadQueueWgsl(options = {}) {
  const { url = queueWgslUrl, fetcher = globalThis.fetch } = options ?? {};
  const wgslUrl = url instanceof URL ? url : new URL(url, queueWgslUrl);

  if (!fetcher || wgslUrl.protocol === "file:") {
    return readFile(fileURLToPath(wgslUrl), "utf8");
  }

  const response = await fetcher(wgslUrl);
  if (!response.ok) {
    const status = "status" in response ? response.status : "unknown";
    const statusText = "statusText" in response ? response.statusText : "";
    const detail = statusText ? `${status} ${statusText}` : `${status}`;
    throw new Error(`Failed to load WGSL (${detail})`);
  }
  return response.text();
}

module.exports = {
  queueWgslUrl,
  loadQueueWgsl,
};
