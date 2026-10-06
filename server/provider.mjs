import { setTimeout as delay } from "node:timers/promises";

export function createProvider(
  apiKey,
  { base = "https://api.resend.com", interval = 600 } = {},
) {
  let queue = Promise.resolve(),
    last = 0;
  function request(path, options = {}) {
    const task = queue.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await delay(Math.max(0, interval - (Date.now() - last)));
        last = Date.now();
        const r = await fetch(base + path, {
          ...options,
          signal: AbortSignal.timeout(25000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
        });
        if ((r.status === 429 || r.status >= 500) && attempt < 3) {
          await delay(
            Math.min(
              10000,
              Math.max(
                1000 * 2 ** attempt,
                Number(r.headers.get("retry-after") || 0) * 1000,
              ),
            ),
          );
          continue;
        }
        const body = await r.json();
        if (!r.ok) {
          const e = new Error(body.message || `Resend : erreur ${r.status}`);
          e.status = r.status === 429 ? 429 : 502;
          e.providerStatus = r.status;
          throw e;
        }
        return body;
      }
    });
    queue = task.catch(() => {});
    return task;
  }
  return {
    domains: () => request("/domains"),
    list: (kind, after) =>
      request(
        `/emails${kind === "received" ? "/receiving" : ""}?limit=100${after ? "&after=" + encodeURIComponent(after) : ""}`,
      ),
    get: (kind, id) =>
      request(
        `/emails${kind === "received" ? "/receiving" : ""}/${encodeURIComponent(id)}`,
      ),
    attachments: (kind, id) =>
      request(
        `/emails${kind === "received" ? "/receiving" : ""}/${encodeURIComponent(id)}/attachments`,
      ),
    attachment: (kind, id, attachment) =>
      request(
        `/emails${kind === "received" ? "/receiving" : ""}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachment)}`,
      ),
    send: (body, key) =>
      request("/emails", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(body),
      }),
  };
}
