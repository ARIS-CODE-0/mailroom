import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export function createStore(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, date TEXT NOT NULL,
      payload TEXT NOT NULL, complete INTEGER DEFAULT 0,
      folder TEXT NOT NULL, unread INTEGER DEFAULT 1, starred INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS send_requests (id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (email_id TEXT, id TEXT, filename TEXT, content_type TEXT, content BLOB, PRIMARY KEY(email_id,id));
    CREATE INDEX IF NOT EXISTS message_date ON messages(date DESC);`);
  function get(id) {
    const r = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
    return (
      r && {
        ...JSON.parse(r.payload),
        id: r.id,
        kind: r.kind,
        folder: r.folder,
        unread: !!r.unread,
        starred: !!r.starred,
        complete: !!r.complete,
      }
    );
  }
  function put(email, kind, complete = false) {
    const prev = get(email.id);
    const merged = { ...prev, ...email };
    for (const key of ["folder", "unread", "starred", "complete", "kind"])
      delete merged[key];
    db.prepare(
      `INSERT INTO messages(id,kind,date,payload,complete,folder,unread) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, complete=MAX(messages.complete,excluded.complete)`,
    ).run(
      email.id,
      kind,
      email.created_at || new Date().toISOString(),
      JSON.stringify(merged),
      +complete,
      kind === "received" ? "inbox" : "sent",
      kind === "received" ? 1 : 0,
    );
    return get(email.id);
  }
  return {
    db,
    get,
    put,
    setting(key, fallback) {
      const r = db.prepare("SELECT payload FROM settings WHERE id=?").get(key);
      return r ? JSON.parse(r.payload) : fallback;
    },
    setSetting(key, value) {
      db.prepare("INSERT OR REPLACE INTO settings VALUES(?,?)").run(
        key,
        JSON.stringify(value),
      );
    },
    list({ folder = "inbox", q = "", offset = 0, limit = 40 }) {
      const rows = db
        .prepare("SELECT id FROM messages ORDER BY date DESC")
        .all()
        .map((r) => get(r.id));
      const filtered = rows.filter(
        (m) =>
          (folder === "starred"
            ? m.starred && m.folder !== "trash"
            : m.folder === folder) &&
          (!q ||
            [m.subject, m.from, ...(m.to || []), ...(m.cc || []), m.text]
              .join(" ")
              .toLocaleLowerCase()
              .includes(q.toLocaleLowerCase())),
      );
      return {
        data: filtered
          .slice(offset, offset + limit)
          .map(({ html, headers, raw, ...m }) => m),
        total: filtered.length,
        has_more: offset + limit < filtered.length,
      };
    },
    counts() {
      const out = {
        inbox: 0,
        sent: 0,
        archive: 0,
        trash: 0,
        starred: 0,
        unread: 0,
        drafts: db.prepare("SELECT count(*) AS n FROM drafts").get().n,
      };
      for (const r of db
        .prepare("SELECT folder,unread,starred FROM messages")
        .all()) {
        out[r.folder]++;
        if (r.folder === "inbox" && r.unread) out.unread++;
        if (r.folder !== "trash" && r.starred) out.starred++;
      }
      return out;
    },
  };
}
