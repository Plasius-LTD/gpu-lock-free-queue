export const queueWgslUrl = new URL("./queue.wgsl", import.meta.url);

export async function loadQueueWgsl(options = {}) {
  const { url = queueWgslUrl, fetcher = globalThis.fetch } = options ?? {};
  const wgslUrl = url instanceof URL ? url : new URL(url, queueWgslUrl);

  if (!fetcher || wgslUrl.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
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
