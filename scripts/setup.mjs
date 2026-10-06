import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const destination = resolve(root, "server/.env");
if (existsSync(destination)) {
  console.log("Configuration existante conservée.");
  process.exit(0);
}
const credentials = JSON.parse(
  readFileSync(resolve(homedir(), ".config/resend/credentials.json"), "utf8"),
);
const profile = credentials.profiles[credentials.active_profile || "default"];
const key = process.env.RESEND_API_KEY || profile?.api_key;
if (!key?.startsWith("re_"))
  throw new Error(
    "Clé introuvable. Fournis RESEND_API_KEY ou connecte Resend CLI avec le stockage fichier.",
  );
const r = await fetch("https://api.resend.com/domains", {
  headers: { Authorization: `Bearer ${key}` },
});
if (!r.ok) throw new Error("Impossible de lire les domaines Resend.");
const domains = (await r.json()).data
  .filter((d) => d.status === "verified")
  .map((d) => d.name);
if (!domains.length) throw new Error("Aucun domaine vérifié.");
const password = randomBytes(24).toString("base64url");
writeFileSync(
  destination,
  `RESEND_API_KEY=${key}\nAPP_PASSWORD=${password}\nALLOWED_DOMAINS=${domains.join(",")}\nHOST=127.0.0.1\nPORT=3035\nALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081,http://localhost:3035,http://127.0.0.1:3035\n`,
  { mode: 0o600 },
);
chmodSync(destination, 0o600);
console.log(
  `Configuration écrite dans server/.env. Domaines détectés : ${domains.join(", ")}. Le mot de passe est dans APP_PASSWORD.`,
);
