import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
const root = resolve(import.meta.dirname, ".."),
  data = resolve(root, "server/data");
mkdirSync(data, { recursive: true, mode: 0o700 });
const name = ["expo", "tailscale"].includes(process.argv[3])
  ? process.argv[3]
  : "api";
const pidfile = resolve(data, name + ".pid");
const entry =
  name === "api"
    ? resolve(root, "server/index.mjs")
    : name === "tailscale"
      ? resolve(root, "scripts/tailscale-bridge.mjs")
      : resolve(root, "node_modules/expo/bin/cli");
function current() {
  if (!existsSync(pidfile)) return null;
  try {
    const pid = Number(readFileSync(pidfile, "utf8"));
    const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    return args.includes(entry) ? pid : null;
  } catch {
    return null;
  }
}
const action = process.argv[2] || "status";
const pid = current();
if (action === "status") {
  console.log(`${name} : ${pid ? "en cours (PID " + pid + ")" : "arrêté"}`);
  process.exit(pid ? 0 : 1);
}
if (action === "stop") {
  if (pid) process.kill(pid, "SIGTERM");
  if (existsSync(pidfile)) unlinkSync(pidfile);
  console.log(`${name} arrêté.`);
  process.exit(0);
}
if (action !== "start")
  throw new Error(
    "Utilisation : node scripts/service.mjs start|stop|status [api|expo]",
  );
if (pid) {
  console.log(`${name} déjà en cours (PID ${pid}).`);
  process.exit(0);
}
const out = openSync(resolve(data, name + ".log"), "a", 0o600);
const args =
  name === "api"
    ? ["--env-file=" + resolve(root, "server/.env"), entry]
    : name === "tailscale"
      ? [entry]
      : [
          "--dns-result-order=ipv4first",
          entry,
          "start",
          "--localhost",
          "--port",
          "8081",
        ];
const child = spawn(process.execPath, args, {
  cwd: root,
  detached: true,
  stdio: ["ignore", out, out],
  env: {
    ...process.env,
    ...(existsSync(resolve(root, ".env"))
      ? parseEnv(readFileSync(resolve(root, ".env"), "utf8"))
      : {}),
    EXPO_UNSTABLE_HEADLESS: "1",
    CI: "0",
  },
});
child.unref();
closeSync(out);
writeFileSync(pidfile, String(child.pid), { mode: 0o600 });
let healthy = false;
for (let attempt = 0; attempt < 30; attempt++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (!current()) break;
  try {
    const r = await fetch(
      name === "tailscale"
        ? `http://${parseEnv(readFileSync(resolve(root, ".env"), "utf8")).EXPO_PUBLIC_TAILSCALE_HOST}:3035/health`
        : name === "api"
          ? "http://127.0.0.1:3035/health"
          : "http://127.0.0.1:8081/status",
      { signal: AbortSignal.timeout(1000) },
    );
    if (r.ok) {
      healthy = true;
      break;
    }
  } catch {}
}
if (!healthy)
  throw new Error(`Échec au démarrage. Consulter server/data/${name}.log.`);
console.log(
  `${name} démarré (PID ${child.pid}). Journal : server/data/${name}.log`,
);
