import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createProvider } from "../provider.mjs";
test("Resend HTTP adapter uses receiving paths and keeps idempotency keys on rate-limit retry", async (t) => {
  const requests = [];
  let post = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      url: req.url,
      auth: req.headers.authorization,
      key: req.headers["idempotency-key"],
      body,
    });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && post++ === 0) {
      res.statusCode = 429;
      res.end(JSON.stringify({ message: "rate limit" }));
    } else
      res.end(
        JSON.stringify(
          req.method === "POST"
            ? { id: "sent" }
            : { data: [], has_more: false },
        ),
      );
  });
  server.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const provider = createProvider("fake-test-key", {
    base: `http://127.0.0.1:${server.address().port}`,
    interval: 0,
  });
  await provider.list("received", "cursor");
  assert.equal(requests[0].url, "/emails/receiving?limit=100&after=cursor");
  await provider.send(
    { from: "hi@example.com", to: ["a@example.org"], text: "body" },
    "same-key",
  );
  assert.equal(requests.length, 3);
  assert.equal(requests[1].key, "same-key");
  assert.equal(requests[2].key, "same-key");
  assert.equal(requests[1].body, requests[2].body);
  assert.ok(requests.every((r) => r.auth === "Bearer fake-test-key"));
});
