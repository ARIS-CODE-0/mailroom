import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.mjs";
import { createStore } from "../store.mjs";

async function fixture(t, overrides = {}) {
  const store = createStore(":memory:");
  const sent = [];
  const received = {
    id: "incoming-1",
    from: "Alice <alice@example.org>",
    to: ["bonjour@example.com"],
    cc: ["copy@example.org"],
    bcc: [],
    subject: "Projet de vendredi",
    html: "<p>Bonjour <b>Demo User</b></p><script>bad()</script>",
    text: null,
    message_id: "<parent@example.org>",
    created_at: "2026-10-06T10:00:00Z",
    attachments: [],
  };
  const provider = {
    domains: async () => ({
      data: [
        {
          name: "example.com",
          status: "verified",
          capabilities: { sending: "enabled", receiving: "enabled" },
        },
      ],
    }),
    list: async (kind) => ({
      data: kind === "received" ? [received] : [],
      has_more: false,
    }),
    get: async () => received,
    attachments: async () => ({ data: [] }),
    send: async (body, key) => {
      sent.push({ body, key });
      return { id: "sent-" + sent.length };
    },
    ...overrides,
  };
  const service = createApp({
    store,
    provider,
    password: "test-password-long-enough",
    allowedDomains: ["example.com"],
    origins: ["http://localhost:3036"],
  });
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => {
    server.close();
    store.db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-long-enough" }),
  });
  const { token } = await login.json();
  async function req(path, method = "GET", body, auth = token, extra = {}) {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  return { store, sent, provider, service, req, token };
}
const mail = (extra = {}) => ({
  id: randomUUID(),
  from: "Demo User <bonjour@example.com>",
  to: ["alice@example.org"],
  cc: [],
  bcc: [],
  subject: "Bonjour",
  text: "Un message personnel.",
  attachments: [],
  ...extra,
});

test("authentication, CORS, session revocation and secrets stay server-side", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.req("/messages", "GET", null, "")).status, 401);
  assert.equal(
    (await f.req("/login", "POST", { password: "wrong" }, "")).status,
    401,
  );
  assert.equal(
    (
      await f.req("/messages", "GET", null, f.token, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const config = await f.req("/config");
  assert.equal(config.status, 200);
  assert.ok(!JSON.stringify(config).includes("test-password"));
  assert.equal((await f.req("/logout", "POST")).status, 200);
  assert.equal((await f.req("/messages")).status, 401);
});
test("received HTML becomes readable text, search and read/archive/star flags survive sync", async (t) => {
  const f = await fixture(t);
  await f.service.sync();
  const list = await f.req("/messages?q=Demo");
  assert.equal(list.data.total, 1);
  assert.ok(!list.data.data[0].text.includes("bad()"));
  await f.req("/messages/incoming-1");
  await f.req("/messages/incoming-1", "PATCH", {
    folder: "archive",
    starred: true,
  });
  await f.service.sync();
  const m = f.store.get("incoming-1");
  assert.equal(m.folder, "archive");
  assert.equal(m.unread, false);
  assert.equal(m.starred, true);
  assert.equal((await f.req("/messages?folder=starred")).data.total, 1);
  assert.equal((await f.req("/messages?folder=inbox")).data.total, 0);
  await f.req("/messages/incoming-1", "PATCH", { folder: "trash" });
  assert.equal((await f.req("/messages?folder=starred")).data.total, 0);
});
test("draft saves incomplete addresses and preserves file bytes; send enforces valid recipients", async (t) => {
  const f = await fixture(t);
  const d = mail({
    to: ["incomplete@"],
    attachments: [
      {
        filename: "bonjour.txt",
        content: Buffer.from("Ça marche !").toString("base64"),
      },
    ],
  });
  assert.equal((await f.req("/drafts/" + d.id, "PUT", d)).status, 200);
  assert.equal(
    (await f.req("/drafts/" + d.id)).data.attachments[0].content,
    d.attachments[0].content,
  );
  assert.equal((await f.req("/send", "POST", d)).status, 400);
  assert.equal(f.sent.length, 0);
  await f.req("/drafts/" + d.id, "DELETE");
  assert.equal((await f.req("/drafts/" + d.id)).status, 404);
});
test("send retains Cc, Bcc, sender and attachments; idempotent retries never resend", async (t) => {
  const f = await fixture(t);
  const d = mail({
    cc: ["cc@example.org"],
    bcc: ["private@example.org"],
    attachments: [
      { filename: "a.txt", content: "aGVsbG8=", content_type: "text/plain" },
    ],
  });
  await f.req("/drafts/" + d.id, "PUT", d);
  const r = await f.req("/send", "POST", d);
  assert.equal(r.status, 200);
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.sent[0].body.bcc, d.bcc);
  assert.deepEqual(f.sent[0].body.cc, d.cc);
  assert.equal(f.sent[0].body.from, d.from);
  assert.equal((await f.req("/send", "POST", d)).data.id, r.data.id);
  assert.equal(f.sent.length, 1);
  assert.equal(
    (await f.req("/send", "POST", { ...d, text: "changed" })).status,
    409,
  );
  assert.equal((await f.req("/drafts/" + d.id)).status, 404);
  const a = await f.req(`/messages/${r.data.id}/attachments/local-0`);
  assert.equal(a.data.content, "aGVsbG8=");
});
test("concurrent retries share the same send", async (t) => {
  const f = await fixture(t);
  const d = mail();
  const results = await Promise.all([
    f.req("/send", "POST", d),
    f.req("/send", "POST", d),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(f.sent.length, 1);
});
test("sending rejects unauthorized domain, header injection and unsafe attachment names", async (t) => {
  const f = await fixture(t);
  for (const extra of [
    { from: "attacker@evil.example" },
    { from: "hello@example.com\r\nBcc: victim@example.org" },
    { subject: "Hello\r\nInjected: true" },
    { attachments: [{ filename: "../secret", content: "YQ==" }] },
    { attachments: [{ filename: "a", content: "not base64!!!" }] },
  ])
    assert.equal((await f.req("/send", "POST", mail(extra))).status, 400);
  assert.equal(f.sent.length, 0);
});
test("reply sends standard threading headers", async (t) => {
  const f = await fixture(t);
  await f.service.sync();
  assert.equal(
    (await f.req("/send", "POST", mail({ replyToId: "incoming-1" }))).status,
    200,
  );
  assert.equal(f.sent[0].body.headers["In-Reply-To"], "<parent@example.org>");
  assert.equal(f.sent[0].body.headers.References, "<parent@example.org>");
});
test("sync fetches all pages and filters other domains", async (t) => {
  const calls = [];
  const f = await fixture(t, {
    list: async (kind, after) => {
      calls.push([kind, after]);
      return kind === "sent"
        ? { data: [], has_more: false }
        : after
          ? {
              data: [
                { id: "ours", from: "a@example.org", to: ["hi@example.com"] },
              ],
              has_more: false,
            }
          : {
              data: [
                {
                  id: "foreign",
                  from: "a@example.org",
                  to: ["hi@foreign.example"],
                },
              ],
              has_more: true,
            };
    },
    get: async (_kind, id) => ({
      id,
      from: "a@example.org",
      to: ["hi@example.com"],
      subject: "ours",
      text: "body",
    }),
  });
  await f.service.sync();
  assert.ok(f.store.get("ours"));
  assert.equal(f.store.get("foreign"), undefined);
  assert.ok(calls.some((c) => c[1] === "foreign"));
});
test("definitive rejection allows correction; uncertain timeout prevents changed retry", async (t) => {
  let timeout = false;
  const f = await fixture(t, {
    send: async () => {
      throw timeout
        ? new Error("timeout")
        : Object.assign(new Error("invalid provider request"), {
            providerStatus: 422,
            status: 502,
          });
    },
  });
  const d = mail();
  assert.equal((await f.req("/send", "POST", d)).status, 502);
  assert.equal(
    f.store.db.prepare("SELECT * FROM send_requests WHERE id=?").get(d.id),
    undefined,
  );
  timeout = true;
  await f.req("/send", "POST", d);
  assert.equal(
    (await f.req("/send", "POST", { ...d, text: "different" })).status,
    409,
  );
});
test("settings validate identities and persist signature", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.req("/settings", "PUT", {
        identities: [{ email: "x@other.example", name: "X" }],
        signature: "",
      })
    ).status,
    400,
  );
  const settings = {
    identities: [{ email: "contact@example.com", name: "Demo User" }],
    signature: "À bientôt",
  };
  assert.equal((await f.req("/settings", "PUT", settings)).status, 200);
  assert.deepEqual((await f.req("/config")).data.settings, settings);
});

test("concurrent sends with different bodies cannot share an idempotency key", async (t) => {
  const f = await fixture(t);
  const d = mail();
  const results = await Promise.all([
    f.req("/send", "POST", d),
    f.req("/send", "POST", { ...d, text: "Other content" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(f.sent.length, 1);
});
test("received attachments are cached on the server and downloadable without the provider", async (t) => {
  const originalFetch = globalThis.fetch;
  let downloads = 0;
  globalThis.fetch = (url, options) =>
    String(url).startsWith("https://cdn.example.test/")
      ? (downloads++, Promise.resolve(new Response("incoming file")))
      : originalFetch(url, options);
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const email = {
    id: "with-file",
    from: "a@example.org",
    to: ["hi@example.com"],
    subject: "file",
    text: "see file",
    attachments: [
      {
        id: "file-1",
        filename: "incoming.txt",
        content_type: "text/plain",
        size: 13,
      },
    ],
  };
  const f = await fixture(t, {
    list: async (kind) => ({
      data: kind === "received" ? [email] : [],
      has_more: false,
    }),
    get: async () => email,
    attachment: async () => ({
      ...email.attachments[0],
      download_url: "https://cdn.example.test/file",
    }),
  });
  await f.service.sync();
  assert.equal(downloads, 1);
  f.provider.attachment = async () => {
    throw new Error("provider offline");
  };
  const r = await f.req("/messages/with-file/attachments/file-1");
  assert.equal(r.status, 200);
  assert.equal(
    Buffer.from(r.data.content, "base64").toString(),
    "incoming file",
  );
  assert.equal(downloads, 1);
});
