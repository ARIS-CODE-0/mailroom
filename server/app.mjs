import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { convert } from "html-to-text";
import { z } from "zod";

const hash = (s) => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
const address = z
  .email()
  .max(254)
  .refine((s) => !/[\r\n]/.test(s));
const attachment = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .refine((s) => !/[\r\n/\\]/.test(s)),
  content: z
    .string()
    .max(35_000_000)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  content_type: z.string().max(150).optional(),
});
const compose = z.object({
  from: z.string().max(350).default(""),
  to: z.array(address).max(50).default([]),
  cc: z.array(address).max(50).default([]),
  bcc: z.array(address).max(50).default([]),
  subject: z
    .string()
    .max(998)
    .refine((s) => !/[\r\n]/.test(s))
    .default(""),
  text: z.string().max(500000).default(""),
  attachments: z.array(attachment).max(20).default([]),
  replyToId: z.string().max(100).optional(),
});
const draftSchema = compose.extend({
  to: z.array(z.string().max(254)).max(50).default([]),
  cc: z.array(z.string().max(254)).max(50).default([]),
  bcc: z.array(z.string().max(254)).max(50).default([]),
});
function sizeCheck(files) {
  if (
    files.reduce((n, f) => n + Buffer.from(f.content, "base64").length, 0) >
    25 * 1024 * 1024
  )
    throw fail(400, "Les pièces jointes dépassent 25 Mo au total.");
}
export function createApp({
  store,
  provider,
  password,
  allowedDomains,
  origins = [],
  webDir,
}) {
  if (!password || password.length < 16)
    throw new Error("APP_PASSWORD doit contenir au moins 16 caractères.");
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:"],
          "connect-src": ["'self'", ...origins],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin))
      return res.status(403).json({ error: "Origine non autorisée." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.post(
    "/api/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Trop de tentatives. Réessaie dans 15 minutes." },
    }),
    express.json({ limit: "2kb" }),
    (req, res) => {
      const input =
        typeof req.body?.password === "string" ? req.body.password : "";
      if (
        !timingSafeEqual(Buffer.from(hash(input)), Buffer.from(hash(password)))
      )
        throw fail(401, "Mot de passe incorrect.");
      const token = randomBytes(32).toString("hex");
      store.db
        .prepare("DELETE FROM sessions WHERE expires < ?")
        .run(Date.now());
      store.db
        .prepare("INSERT INTO sessions VALUES(?,?)")
        .run(hash(token), Date.now() + 30 * 86400000);
      res.json({ token });
    },
  );
  app.use("/api", (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const session = store.db
      .prepare("SELECT expires FROM sessions WHERE hash=?")
      .get(hash(token));
    if (!session || session.expires < Date.now())
      return res
        .status(401)
        .json({ error: "Connecte-toi pour accéder à ta boîte mail." });
    req.sessionHash = hash(token);
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Trop de requêtes. Patiente un instant." },
    }),
    express.json({ limit: "36mb" }),
  );
  app.post("/api/logout", (req, res) => {
    store.db.prepare("DELETE FROM sessions WHERE hash=?").run(req.sessionHash);
    res.json({ ok: true });
  });

  let syncPromise = null;
  const syncState = {
    running: false,
    lastSync: store.setting("lastSync", null),
    error: null,
  };
  let domainCache = null,
    domainTime = 0;
  async function domains() {
    if (domainCache && Date.now() - domainTime < 300000) return domainCache;
    const r = await provider.domains();
    domainCache = r.data.filter((d) =>
      allowedDomains.includes(d.name.toLowerCase()),
    );
    domainTime = Date.now();
    return domainCache;
  }
  function belongs(email, kind) {
    const list =
      kind === "sent"
        ? [email.from]
        : [
            ...(email.to || []),
            ...(email.cc || []),
            ...(email.bcc || []),
            ...(email.received_for || []),
          ];
    return list.some((a) =>
      allowedDomains.includes(
        (String(a).match(/@([^>\s]+)>?$/)?.[1] || "").toLowerCase(),
      ),
    );
  }
  function normalize(m) {
    return {
      ...m,
      to: m.to || [],
      cc: m.cc || [],
      bcc: m.bcc || [],
      attachments: m.attachments || [],
      text:
        m.text ||
        convert(m.html || "", {
          wordwrap: false,
          selectors: [{ selector: "img", format: "skip" }],
        }),
    };
  }
  async function hydrate(id) {
    const m = store.get(id);
    if (!m) throw fail(404, "Message introuvable.");
    if (m.complete) return m;
    const full = await provider.get(m.kind, m.id);
    if (m.kind === "sent" && !full.attachments)
      full.attachments = (await provider.attachments(m.kind, m.id)).data;
    return store.put(normalize(full), m.kind, true);
  }
  async function cachedAttachment(m, attachmentId) {
    const local = store.db
      .prepare("SELECT * FROM attachments WHERE email_id=? AND id=?")
      .get(m.id, attachmentId);
    if (local)
      return {
        filename: local.filename,
        content_type: local.content_type,
        content: Buffer.from(local.content).toString("base64"),
      };
    const a = await provider.attachment(m.kind, m.id, attachmentId);
    if (a.size > 25 * 1024 * 1024)
      throw fail(413, "Cette pièce jointe dépasse 25 Mo.");
    const url = new URL(a.download_url);
    if (url.protocol !== "https:")
      throw fail(502, "URL de pièce jointe invalide.");
    const r = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!r.ok) throw fail(502, "Pièce jointe temporairement indisponible.");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of r.body) {
      bytes += chunk.length;
      if (bytes > 25 * 1024 * 1024)
        throw fail(413, "Cette pièce jointe dépasse 25 Mo.");
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);
    store.db
      .prepare("INSERT OR REPLACE INTO attachments VALUES(?,?,?,?,?)")
      .run(
        m.id,
        a.id,
        a.filename || "piece-jointe",
        a.content_type || "application/octet-stream",
        content,
      );
    return {
      filename: a.filename || "piece-jointe",
      content_type: a.content_type || "application/octet-stream",
      content: content.toString("base64"),
    };
  }
  async function sync() {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      syncState.running = true;
      syncState.error = null;
      try {
        for (const kind of ["received", "sent"]) {
          let cursor = store.setting(`cursor:${kind}`, null),
            pages = 0;
          do {
            const page = await provider.list(kind, cursor);
            let allKnown = page.data.length > 0;
            for (const email of page.data) {
              if (!belongs(email, kind)) continue;
              const prev = store.get(email.id);
              if (!prev?.complete) allKnown = false;
              store.put(email, kind);
              const full = await hydrate(email.id);
              for (const a of full.attachments || []) {
                if (a.size > 25 * 1024 * 1024) continue;
                await cachedAttachment(full, a.id);
              }
            }
            const next =
              page.has_more && page.data.length ? page.data.at(-1).id : null;
            // Check two recent pages on incremental sync; initial backfill resumes in subsequent cycles.
            if (
              !next ||
              (allKnown &&
                !cursor &&
                store.setting(`backfilled:${kind}`, false))
            ) {
              cursor = null;
              store.setSetting(`backfilled:${kind}`, true);
              break;
            }
            cursor = next;
          } while (++pages < 5);
          store.setSetting(`cursor:${kind}`, cursor);
        }
        syncState.lastSync = new Date().toISOString();
        store.setSetting("lastSync", syncState.lastSync);
      } catch (e) {
        syncState.error = e.message;
        throw e;
      } finally {
        syncState.running = false;
        syncPromise = null;
      }
      return syncState;
    })();
    return syncPromise;
  }
  app.get("/api/config", async (_req, res) =>
    res.json({
      domains: await domains(),
      settings: store.setting("preferences", { identities: [], signature: "" }),
      sync: syncState,
      maxAttachmentBytes: 25 * 1024 * 1024,
    }),
  );
  app.put("/api/settings", (req, res) => {
    const settings = z
      .object({
        identities: z
          .array(
            z.object({
              email: address,
              name: z
                .string()
                .max(100)
                .refine((s) => !/[<>\r\n]/.test(s)),
            }),
          )
          .max(30),
        signature: z.string().max(3000),
      })
      .parse(req.body);
    if (
      settings.identities.some(
        (i) => !allowedDomains.includes(i.email.split("@")[1].toLowerCase()),
      )
    )
      throw fail(400, "Utilise une adresse de ton domaine autorisé.");
    store.setSetting("preferences", settings);
    res.json(settings);
  });
  app.get("/api/status", (_req, res) =>
    res.json({ ...syncState, counts: store.counts() }),
  );
  app.post("/api/sync", (_req, res) => {
    sync().catch(() => {});
    res.status(202).json(syncState);
  });
  app.get("/api/messages", (req, res) => {
    const query = z
      .object({
        folder: z
          .enum(["inbox", "sent", "archive", "trash", "starred"])
          .default("inbox"),
        q: z.string().max(500).default(""),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(40),
      })
      .parse(req.query);
    res.json(store.list(query));
  });
  app.get("/api/messages/:id", async (req, res) => {
    const m = await hydrate(req.params.id);
    store.db.prepare("UPDATE messages SET unread=0 WHERE id=?").run(m.id);
    res.json({ ...m, unread: false });
  });
  app.patch("/api/messages/:id", (req, res) => {
    if (!store.get(req.params.id)) throw fail(404, "Message introuvable.");
    const change = z
      .object({
        folder: z.enum(["inbox", "sent", "archive", "trash"]).optional(),
        unread: z.boolean().optional(),
        starred: z.boolean().optional(),
      })
      .parse(req.body);
    for (const [k, v] of Object.entries(change))
      store.db
        .prepare(`UPDATE messages SET ${k}=? WHERE id=?`)
        .run(typeof v === "boolean" ? +v : v, req.params.id);
    res.json(store.get(req.params.id));
  });
  app.get("/api/messages/:id/attachments", async (req, res) => {
    const m = await hydrate(req.params.id);
    if (m.attachments?.length)
      return res.json({ data: m.attachments.map(({ content, ...a }) => a) });
    const result = await provider.attachments(m.kind, m.id);
    store.put({ id: m.id, attachments: result.data }, m.kind, true);
    res.json(result);
  });
  app.get("/api/messages/:id/attachments/:attachmentId", async (req, res) => {
    const m = await hydrate(req.params.id);
    res.json(await cachedAttachment(m, req.params.attachmentId));
  });
  app.get("/api/drafts", (_req, res) =>
    res.json({
      data: store.db
        .prepare("SELECT * FROM drafts ORDER BY updated DESC")
        .all()
        .map((r) => ({
          id: r.id,
          ...JSON.parse(r.payload),
          updated: r.updated,
          attachments: JSON.parse(r.payload).attachments.map(
            ({ content, ...a }) => a,
          ),
        })),
    }),
  );
  app.get("/api/drafts/:id", (req, res) => {
    const r = store.db
      .prepare("SELECT * FROM drafts WHERE id=?")
      .get(req.params.id);
    if (!r) throw fail(404, "Brouillon introuvable.");
    res.json({ id: r.id, ...JSON.parse(r.payload) });
  });
  app.put("/api/drafts/:id", (req, res) => {
    z.uuid().parse(req.params.id);
    const payload = draftSchema.parse(req.body);
    sizeCheck(payload.attachments);
    store.db
      .prepare("INSERT OR REPLACE INTO drafts VALUES(?,?,?)")
      .run(req.params.id, JSON.stringify(payload), new Date().toISOString());
    res.json({ ok: true });
  });
  app.delete("/api/drafts/:id", (req, res) => {
    store.db.prepare("DELETE FROM drafts WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });
  const sending = new Map();
  app.post(
    "/api/send",
    rateLimit({
      windowMs: 60000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Patiente une minute avant un nouvel envoi." },
    }),
    async (req, res) => {
      const key = z.uuid().parse(req.body.id);
      const body = compose.parse(req.body);
      const payloadHash = hash(JSON.stringify(body));
      const old = store.db
        .prepare("SELECT * FROM send_requests WHERE id=?")
        .get(key);
      if (old && old.hash !== payloadHash)
        throw fail(
          409,
          "Ce brouillon a déjà été soumis avec un autre contenu. Crée un nouveau message.",
        );
      if (old?.result) return res.json(JSON.parse(old.result));
      if (old && Date.now() - old.created > 23 * 3600000)
        throw fail(
          409,
          "Envoi ancien non confirmé : vérifie les messages envoyés avant de recommencer.",
        );
      if (sending.has(key)) {
        const pending = sending.get(key);
        if (pending.hash !== payloadHash)
          throw fail(
            409,
            "Un autre contenu est déjà en cours d’envoi pour ce brouillon.",
          );
        return res.json(await pending.promise);
      }
      if (!body.to.length || !body.subject.trim() || !body.text.trim())
        throw fail(400, "Renseigne le destinataire, l’objet et le message.");
      if (body.to.length + body.cc.length + body.bcc.length > 50)
        throw fail(400, "Maximum 50 destinataires au total.");
      sizeCheck(body.attachments);
      if (/[\r\n]/.test(body.from)) throw fail(400, "Expéditeur invalide.");
      const sender = body.from.match(
        /^(?:[^<>\r\n]+ <)?([^<>\s]+@[^<>\s]+)>?$/,
      )?.[1];
      if (!sender || !address.safeParse(sender).success)
        throw fail(400, "Adresse d’expédition invalide.");
      const domain = sender.split("@")[1].toLowerCase();
      const active = await domains();
      if (
        !active.some(
          (d) =>
            d.name.toLowerCase() === domain &&
            d.status === "verified" &&
            d.capabilities?.sending !== "disabled",
        )
      )
        throw fail(
          400,
          "Le domaine d’expédition n’est pas vérifié ou autorisé.",
        );
      // Domain lookup awaits the network; another request may have acquired this key meanwhile.
      if (sending.has(key)) {
        const pending = sending.get(key);
        if (pending.hash !== payloadHash)
          throw fail(
            409,
            "Un autre contenu est déjà en cours d’envoi pour ce brouillon.",
          );
        return res.json(await pending.promise);
      }
      const latest = store.db
        .prepare("SELECT * FROM send_requests WHERE id=?")
        .get(key);
      if (latest && latest.hash !== payloadHash)
        throw fail(
          409,
          "Ce brouillon a déjà été soumis avec un autre contenu.",
        );
      if (latest?.result) return res.json(JSON.parse(latest.result));
      const operation = (async () => {
        const { replyToId, ...mail } = body;
        if (replyToId) {
          const parent = await hydrate(replyToId);
          const id = parent.message_id || parent.headers?.["message-id"];
          if (id && !/[\r\n]/.test(id))
            mail.headers = {
              "In-Reply-To": id,
              References: [parent.headers?.references, id]
                .filter(Boolean)
                .join(" ")
                .replace(/[\r\n]/g, " ")
                .slice(-900),
            };
        }
        store.db
          .prepare("INSERT OR IGNORE INTO send_requests VALUES(?,?,NULL,?)")
          .run(key, payloadHash, Date.now());
        let result;
        try {
          result = await provider.send(mail, key);
        } catch (e) {
          // A definitive API rejection can safely be corrected. Timeouts/5xx keep the same key.
          if (
            e.providerStatus >= 400 &&
            e.providerStatus < 500 &&
            ![409, 429].includes(e.providerStatus)
          )
            store.db.prepare("DELETE FROM send_requests WHERE id=?").run(key);
          if (!e.status) {
            e.status = 504;
            e.message =
              "Résultat de l’envoi non confirmé. Réessaie sans modifier le message pour éviter un doublon.";
          }
          throw e;
        }
        const email = {
          ...mail,
          id: result.id,
          created_at: new Date().toISOString(),
          last_event: "sent",
          attachments: mail.attachments.map((a, i) => ({
            id: `local-${i}`,
            filename: a.filename,
            content_type: a.content_type,
            size: Buffer.from(a.content, "base64").length,
          })),
        };
        store.db.exec("BEGIN");
        try {
          store.put(email, "sent", true);
          mail.attachments.forEach((a, i) =>
            store.db
              .prepare("INSERT OR REPLACE INTO attachments VALUES(?,?,?,?,?)")
              .run(
                result.id,
                `local-${i}`,
                a.filename,
                a.content_type || "application/octet-stream",
                Buffer.from(a.content, "base64"),
              ),
          );
          store.db
            .prepare("UPDATE send_requests SET result=? WHERE id=?")
            .run(JSON.stringify(result), key);
          store.db.prepare("DELETE FROM drafts WHERE id=?").run(key);
          store.db.exec("COMMIT");
        } catch (e) {
          store.db.exec("ROLLBACK");
          throw e;
        }
        return result;
      })();
      sending.set(key, { hash: payloadHash, promise: operation });
      try {
        res.json(await operation);
      } finally {
        sending.delete(key);
      }
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Route introuvable." }),
  );
  if (webDir) app.use(express.static(webDir));
  app.use((err, _req, res, _next) => {
    const status = err instanceof z.ZodError ? 400 : err.status || 500;
    const message =
      err instanceof z.ZodError
        ? "Vérifie les champs : " +
          err.issues
            .map((i) => i.path.join(".") + " " + i.message)
            .slice(0, 3)
            .join(", ")
        : status === 500
          ? "Une erreur interne est survenue."
          : err.message;
    if (status === 500) console.error("Erreur interne", err.name);
    res.status(status).json({ error: message });
  });
  return { app, sync, syncState };
}
