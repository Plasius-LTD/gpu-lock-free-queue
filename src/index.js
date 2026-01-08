export const queueWgslUrl = new URL("./queue.wgsl", import.meta.url);

export async function loadQueueWgsl() {
  const response = await fetch(queueWgslUrl);
  return response.text();
}
