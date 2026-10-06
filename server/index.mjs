import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.mjs";
import { createProvider } from "./provider.mjs";
import { createApp } from "./app.mjs";
process.umask(0o077);
const dir = dirname(fileURLToPath(import.meta.url));
if (!process.env.RESEND_API_KEY)
  throw new Error("RESEND_API_KEY manquante. Lance npm run setup.");
const store = createStore(
  resolve(dir, process.env.DATABASE_PATH || "data/mail.sqlite"),
);
const { app, sync } = createApp({
  store,
  provider: createProvider(process.env.RESEND_API_KEY),
  password: process.env.APP_PASSWORD,
  allowedDomains: (process.env.ALLOWED_DOMAINS || "")
    .split(",")
    .filter(Boolean),
  origins: (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
  webDir: resolve(dir, "../dist"),
});
const port = Number(process.env.PORT || 3035);
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `${process.env.APP_NAME || "Mailroom"} : http://${process.env.HOST || "127.0.0.1"}:${port}`,
  ),
);
const runSync = () =>
  sync().catch((e) => console.error("Synchronisation :", e.message));
runSync();
const timer = setInterval(runSync, 60000);
timer.unref();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  });
