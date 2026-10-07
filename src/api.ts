import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
const defaultUrl =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.port === "8081"
      ? process.env.EXPO_PUBLIC_API_URL || "http://localhost:3035"
      : window.location.origin
    : process.env.EXPO_PUBLIC_API_URL || "http://localhost:3035";
let base = defaultUrl;
let token = "";
export const productName = process.env.EXPO_PUBLIC_APP_NAME || "Mailroom";
export const productTagline =
  process.env.EXPO_PUBLIC_APP_TAGLINE || "Your domain. Your inbox.";
export const storage = {
  async get(key: string) {
    const scoped = `mailroom_${key}`;
    return Platform.OS === "web"
      ? sessionStorage.getItem(scoped)
      : SecureStore.getItemAsync(scoped);
  },
  async set(key: string, value: string) {
    const scoped = `mailroom_${key}`;
    if (Platform.OS === "web") sessionStorage.setItem(scoped, value);
    else await SecureStore.setItemAsync(scoped, value);
  },
  async remove(key: string) {
    const scoped = `mailroom_${key}`;
    if (Platform.OS === "web") sessionStorage.removeItem(scoped);
    else await SecureStore.deleteItemAsync(scoped);
  },
};
export const api = {
  get base() {
    return base;
  },
  async restore() {
    base = (await storage.get("aris-url")) || defaultUrl;
    token = (await storage.get("aris-token")) || "";
    return !!token;
  },
  async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(base + "/api" + path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        signal: AbortSignal.timeout(90000),
      });
    } catch {
      throw new Error(
        "Serveur inaccessible. Vérifie son adresse et ta connexion.",
      );
    }
    const data = await response
      .json()
      .catch(() => ({ error: "Réponse du serveur invalide." }));
    if (!response.ok)
      throw Object.assign(new Error(data.error || "La requête a échoué."), {
        status: response.status,
      });
    return data;
  },
  async login(url: string, password: string) {
    const parsed = new URL(url.trim());
    if (
      parsed.protocol !== "https:" &&
      // This exact deployment host is reached through the encrypted Tailscale network.
      parsed.hostname !== process.env.EXPO_PUBLIC_TAILSCALE_HOST &&
      !["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(parsed.hostname)
    )
      throw new Error("Utilise une adresse HTTPS pour protéger ta connexion.");
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error("Adresse du serveur invalide.");
    base = url.trim().replace(/\/$/, "");
    token = "";
    const result = await api.request<{ token: string }>("/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    token = result.token;
    await storage.set("aris-url", base);
    await storage.set("aris-token", token);
  },
  async logout() {
    try {
      await api.request("/logout", { method: "POST" });
    } finally {
      token = "";
      await storage.remove("aris-token");
    }
  },
};
