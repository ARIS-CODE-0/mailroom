import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve(import.meta.dirname, "../server/data");
mkdirSync(resolve(dir, "backups"), { recursive: true, mode: 0o700 });
const target = resolve(
  dir,
  "backups",
  `mail-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
const db = new DatabaseSync(resolve(dir, "mail.sqlite"));
db.prepare("VACUUM INTO ?").run(target);
db.close();
chmodSync(target, 0o600);
console.log("Sauvegarde créée : " + target);
