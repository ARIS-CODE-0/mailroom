import net from "node:net";
const host = process.env.EXPO_PUBLIC_TAILSCALE_HOST;
if (!host) throw new Error("EXPO_PUBLIC_TAILSCALE_HOST manquant.");
const servers = [3035, 8081].map((port) => {
  const server = net.createServer((client) => {
    const upstream = net.connect(port, "127.0.0.1");
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  server.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
  server.listen(port, host, () =>
    console.log(`Tailscale ${host}:${port} -> 127.0.0.1:${port}`),
  );
  return server;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    servers.forEach((s) => s.close());
    process.exit(0);
  });
