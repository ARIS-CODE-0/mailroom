import { createApp } from "../app.mjs";
import { createStore } from "../store.mjs";
import { resolve } from "node:path";
const store = createStore(":memory:");
const emails = [
  {
    id: "demo-1",
    from: "Camille <camille@example.org>",
    to: ["bonjour@example.com"],
    subject: "Les derniers détails pour vendredi",
    text: "Bonjour,\n\nTout est prêt pour vendredi. Tu trouveras le programme en pièce jointe.\n\nÀ très vite,\nCamille",
    cc: ["lea@example.org"],
    attachments: [
      {
        id: "local-0",
        filename: "programme.txt",
        size: 18,
        content_type: "text/plain",
      },
    ],
  },
  {
    id: "demo-2",
    from: "Thomas <thomas@example.org>",
    to: ["contact@example.com"],
    subject: "Un café la semaine prochaine ?",
    text: "Hello,\n\nEst-ce que mardi matin te conviendrait ?\n\nThomas",
  },
  {
    id: "demo-3",
    from: "Studio Forma <studio@example.org>",
    to: ["bonjour@example.com"],
    subject: "Les premières pistes du projet",
    text: "Voici les premières pistes pour notre collaboration. On en parle quand tu veux !",
  },
  {
    id: "demo-4",
    from: "Léa <lea@example.org>",
    to: ["bonjour@example.com"],
    subject: "Merci pour ton retour",
    text: "Merci pour tes remarques, tout a été intégré. Belle journée !",
  },
];
emails.forEach((m, i) =>
  store.put(
    {
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      cc: [],
      bcc: [],
      attachments: [],
      message_id: `<${m.id}@example.org>`,
      ...m,
    },
    "received",
    true,
  ),
);
store.db
  .prepare("INSERT INTO attachments VALUES(?,?,?,?,?)")
  .run(
    "demo-1",
    "local-0",
    "programme.txt",
    "text/plain",
    Buffer.from("Programme vendredi"),
  );
store.setSetting("preferences", {
  identities: [{ email: "bonjour@example.com", name: "Demo User" }],
  signature: "Demo User",
});
let counter = 0;
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
  list: async () => ({ data: [], has_more: false }),
  get: async (_kind, id) => store.get(id),
  attachments: async () => ({ data: [] }),
  send: async () => ({ id: `demo-sent-${++counter}` }),
};
const { app } = createApp({
  store,
  provider,
  password: "browser-test-password",
  allowedDomains: ["example.com"],
  origins: ["http://localhost:3036"],
  webDir: resolve("dist"),
});
app.listen(3036, "127.0.0.1", () =>
  console.log("Fixture ready on 3036 — no real emails sent"),
);
