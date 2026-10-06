import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { api, productName, productTagline } from "./src/api";
import { C, s } from "./src/styles";
import {
  Button,
  Icon,
  IconButton,
  Input,
  emailOf,
  nameOf,
  date,
  size,
  IconName,
} from "./src/ui";
import { Composer, Preferences } from "./src/Composer";
import type {
  Attachment,
  Config,
  Draft,
  Message,
  SyncStatus,
} from "./src/types";

type Folder = "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash";
const folders: { id: Folder; name: string; icon: IconName }[] = [
  { id: "inbox", name: "Boîte de réception", icon: "inbox" },
  { id: "starred", name: "Favoris", icon: "star" },
  { id: "sent", name: "Envoyés", icon: "send" },
  { id: "drafts", name: "Brouillons", icon: "file-text" },
  { id: "archive", name: "Archives", icon: "archive" },
  { id: "trash", name: "Corbeille", icon: "trash-2" },
];
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <MailApp />
    </SafeAreaProvider>
  );
}
function MailApp() {
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [ready, setReady] = useState(false),
    [logged, setLogged] = useState(false),
    [url, setUrl] = useState(api.base),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [config, setConfig] = useState<Config | null>(null),
    [status, setStatus] = useState<SyncStatus | null>(null);
  const [folder, setFolder] = useState<Folder>("inbox"),
    [search, setSearch] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Message | null>(null),
    [compose, setCompose] = useState<Draft | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [menu, setMenu] = useState(false);
  const listGeneration = useRef(0);
  const report = (e: any) => {
    setError(e.message || String(e));
    if (e.status === 401) setLogged(false);
  };
  useEffect(() => {
    api
      .restore()
      .then((has) => {
        setUrl(api.base);
        setLogged(has);
      })
      .catch(report)
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const loadConfig = useCallback(async () => {
    const r = await api.request<Config>("/config");
    setConfig(r);
  }, []);
  const refresh = useCallback(
    async (append = false) => {
      const generation = ++listGeneration.current;
      setLoading(true);
      try {
        const nextStatus = await api.request<SyncStatus>("/status");
        setStatus(nextStatus);
        if (folder === "drafts") {
          const r = await api.request<{ data: Draft[] }>("/drafts");
          if (generation === listGeneration.current) setDrafts(r.data);
        } else {
          const target = append ? 40 : Math.max(40, messages.length);
          const data: Message[] = [];
          let hasMore = false;
          do {
            const r = await api.request<{ data: Message[]; has_more: boolean }>(
              `/messages?folder=${folder}&q=${encodeURIComponent(search)}&offset=${(append ? messages.length : 0) + data.length}&limit=${Math.min(100, target - data.length)}`,
            );
            data.push(...r.data);
            hasMore = r.has_more;
          } while (hasMore && data.length < target);
          if (generation === listGeneration.current) {
            setMessages((prev) => (append ? [...prev, ...data] : data));
            setMore(hasMore);
          }
        }
      } catch (e) {
        report(e);
      } finally {
        if (generation === listGeneration.current) setLoading(false);
      }
    },
    [folder, search, messages.length],
  );
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    ++listGeneration.current;
    setMessages([]);
    setDrafts([]);
    setMore(false);
    setLoading(true);
  }, [folder, search]);
  useEffect(() => {
    if (logged) loadConfig().catch(report);
  }, [logged, loadConfig]);
  useEffect(() => {
    if (!logged) return;
    const t = setTimeout(() => refreshRef.current(), 200);
    return () => clearTimeout(t);
  }, [logged, folder, search]);
  useEffect(() => {
    if (!logged) return;
    const t = setInterval(() => refreshRef.current(), 15000);
    return () => clearInterval(t);
  }, [logged]);
  const identities = config?.settings.identities || [];
  const defaultFrom = identities[0]
    ? identities[0].name
      ? `${identities[0].name} <${identities[0].email}>`
      : identities[0].email
    : `bonjour@${config?.domains[0]?.name || "example.com"}`;
  function newDraft(overrides: Partial<Draft> = {}) {
    setCompose({
      id: Crypto.randomUUID(),
      from: defaultFrom,
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      text: config?.settings.signature
        ? `\n\n${config.settings.signature}`
        : "",
      attachments: [],
      ...overrides,
    });
  }
  async function openMessage(m: Message) {
    setBusy(true);
    setError("");
    try {
      const full = await api.request<Message>(`/messages/${m.id}`);
      setSelected(full);
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, unread: false } : x)),
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function patch(m: Message, change: Partial<Message>) {
    try {
      const result = await api.request<Message>(`/messages/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      });
      setSelected((prev) => (prev?.id === m.id ? result : prev));
      await refreshRef.current();
      if (change.folder) setSelected(null);
    } catch (e) {
      report(e);
    }
  }
  function reply(m: Message, all = false) {
    const own = (a: string) =>
      config?.domains.some((d) =>
        emailOf(a)
          .toLowerCase()
          .endsWith("@" + d.name),
      );
    const from =
      m.kind === "sent" ? m.from : [...m.to, ...m.cc].find(own) || defaultFrom;
    const primary =
      m.kind === "sent"
        ? m.to
        : m.reply_to?.length
          ? m.reply_to
          : [emailOf(m.from)];
    const to = Array.from(new Set(primary.map(emailOf)));
    const cc = all
      ? Array.from(new Set([...m.to, ...m.cc].map(emailOf))).filter(
          (a) => !own(a) && !to.includes(a),
        )
      : [];
    newDraft({
      from,
      to,
      cc,
      subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      text: `${config?.settings.signature ? "\n\n" + config.settings.signature : ""}\n\nLe ${date(m.created_at)}, ${m.from} a écrit :\n${m.text
        .split("\n")
        .map((l) => "> " + l)
        .join("\n")}`,
      replyToId: m.id,
    });
  }
  async function fetchAttachment(m: Message, a: Attachment) {
    return api.request<Attachment>(`/messages/${m.id}/attachments/${a.id}`);
  }
  async function download(m: Message, a: Attachment) {
    setBusy(true);
    try {
      const file = await fetchAttachment(m, a);
      if (Platform.OS === "web") {
        const bytes = Uint8Array.from(atob(file.content!), (c) =>
          c.charCodeAt(0),
        );
        const href = URL.createObjectURL(
          new Blob([bytes], {
            type: file.content_type || "application/octet-stream",
          }),
        );
        const link = document.createElement("a");
        link.href = href;
        link.download = file.filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(href), 5000);
      } else {
        const name = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uri =
          FileSystem.cacheDirectory + Crypto.randomUUID() + "-" + name;
        await FileSystem.writeAsStringAsync(uri, file.content!, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Share.share({
          url: uri,
          message: file.filename,
        });
      }
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function forward(m: Message) {
    setBusy(true);
    try {
      const attachments = [];
      for (const a of m.attachments || [])
        attachments.push(await fetchAttachment(m, a));
      newDraft({
        subject: `Tr: ${m.subject}`,
        text: `\n\n---------- Message transféré ----------\nDe : ${m.from}\nÀ : ${m.to.join(", ")}\nDate : ${new Date(m.created_at).toLocaleString("fr-FR")}\nObjet : ${m.subject}\n\n${m.text}`,
        attachments,
      });
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function login() {
    setBusy(true);
    setError("");
    try {
      await api.login(url, password);
      setPassword("");
      setLogged(true);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.blue} />
      </View>
    );
  if (!logged)
    return (
      <SafeAreaView style={s.login}>
        <View style={s.loginCard}>
          <View style={s.logo}>
            <Icon name="at-sign" color="white" size={29} />
          </View>
          <Text style={s.loginTitle}>{productTagline}</Text>
          <Text style={s.loginText}>
            Bienvenue dans {productName}. Retrouve tes échanges et toutes tes
            adresses au même endroit.
          </Text>
          <Input
            label="Adresse du serveur"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Input
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onSubmitEditing={login}
          />
          {!!error && (
            <Text accessibilityRole="alert" style={s.errorText}>
              {error}
            </Text>
          )}
          <Button
            title={busy ? "Connexion…" : "Ouvrir ma boîte mail"}
            icon="arrow-right"
            primary
            disabled={busy || !password || !url}
            onPress={login}
          />
          <Text style={s.loginFoot}>
            Un espace personnel, connecté à ton domaine.
          </Text>
        </View>
      </SafeAreaView>
    );
  const sidebar = (
    <View style={s.sidebar}>
      <View style={s.brand}>
        <View style={s.brandMark}>
          <Icon name="at-sign" color="white" size={22} />
        </View>
        <Text style={s.brandText}>{productName.toLowerCase()}</Text>
      </View>
      <Text style={s.workspaceLabel}>ESPACE PERSONNEL</Text>
      <View style={s.domainCard}>
        <View style={s.dot} />
        <Text numberOfLines={1} style={s.domainName}>
          {config?.domains[0]?.name || "Connexion…"}
        </Text>
        <Icon name="chevron-down" size={14} color="#91A4BD" />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          newDraft();
          setMenu(false);
        }}
        style={s.composeButton}
      >
        <Icon name="edit-3" color="white" size={18} />
        <Text style={s.composeButtonText}>Nouveau message</Text>
        <Text style={{ color: "#BAD0FF", marginLeft: "auto", fontSize: 20 }}>
          +
        </Text>
      </Pressable>
      <Text style={s.navLabel}>MESSAGERIE</Text>
      {folders.map((f) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={f.name}
          accessibilityState={{ selected: folder === f.id }}
          key={f.id}
          onPress={() => {
            setFolder(f.id);
            setSelected(null);
            setMenu(false);
          }}
          style={[s.navItem, folder === f.id && s.navActive]}
        >
          <Icon
            name={f.icon}
            color={folder === f.id ? "#91B7FF" : "#8B9CB3"}
            size={18}
          />
          <Text
            style={[
              s.navText,
              folder === f.id && { color: "white", fontWeight: "600" },
            ]}
          >
            {f.name}
          </Text>
          {!!status?.counts[f.id] && (
            <Text
              style={[
                s.navCount,
                folder === f.id && {
                  backgroundColor: "#315DA6",
                  color: "white",
                },
              ]}
            >
              {status.counts[f.id]}
            </Text>
          )}
        </Pressable>
      ))}
      <View style={{ flex: 1, minHeight: 30 }} />
      <View style={s.sidebarFoot}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={[
              s.dot,
              { backgroundColor: status?.error ? "#E8A267" : C.green },
            ]}
          />
          <Text style={{ color: "#B6C4D7", fontSize: 12 }}>
            {status?.running
              ? "Synchronisation…"
              : status?.error
                ? "Synchronisation à vérifier"
                : "Connecté à Resend"}
          </Text>
        </View>
        <Text style={s.syncTime}>
          {status?.lastSync
            ? `Mis à jour à ${new Date(status.lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
            : "Première synchronisation en cours"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setSettingsOpen(true);
          setMenu(false);
        }}
        style={s.profile}
      >
        <View style={s.avatarSmall}>
          <Text style={{ color: "#D2DFF5", fontWeight: "700" }}>A</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>
            My workspace
          </Text>
          <Text style={{ color: "#879AB4", fontSize: 11, marginTop: 3 }}>
            Adresses & préférences
          </Text>
        </View>
        <Icon name="settings" size={17} />
      </Pressable>
    </View>
  );
  return (
    <SafeAreaView style={s.app} edges={["top", "bottom"]}>
      <View style={s.layout}>
        {wide && sidebar}
        <View style={s.main}>
          <View style={[s.topbar, !wide && { paddingHorizontal: 10 }]}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              {!wide && (
                <IconButton
                  icon="menu"
                  label="Ouvrir le menu"
                  onPress={() => setMenu(true)}
                />
              )}
              {wide && (
                <>
                  <Text style={s.breadcrumb}>My workspace</Text>
                  <Icon name="chevron-right" size={14} />
                </>
              )}
              <Text style={s.breadcrumbCurrent}>
                {folders.find((f) => f.id === folder)?.name}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 5 }}>
              <IconButton
                icon="refresh-cw"
                label="Synchroniser"
                onPress={async () => {
                  try {
                    await api.request("/sync", { method: "POST" });
                    setNotice("Synchronisation démarrée");
                    await refreshRef.current();
                  } catch (e) {
                    report(e);
                  }
                }}
              />
              <IconButton
                icon="settings"
                label="Préférences"
                onPress={() => setSettingsOpen(true)}
              />
            </View>
          </View>
          {(!!error || !!notice) && (
            <Pressable
              onPress={() => {
                setError("");
                setNotice("");
              }}
              style={[s.banner, !!error && { backgroundColor: "#FFF0ED" }]}
            >
              <Text
                accessibilityRole="alert"
                style={{ color: error ? "#A23827" : C.green, flex: 1 }}
              >
                {error || notice}
              </Text>
              <Icon name="x" size={15} />
            </Pressable>
          )}
          {!!status?.error && (
            <View style={[s.banner, { backgroundColor: "#FFF7E7" }]}>
              <Text style={{ color: "#8C651B", fontSize: 12 }}>
                Synchronisation interrompue : {status.error}
              </Text>
            </View>
          )}
          {selected ? (
            <>
              <View style={s.readerToolbar}>
                <Button
                  small
                  title="Retour"
                  icon="arrow-left"
                  onPress={() => setSelected(null)}
                />
                <View style={{ flex: 1 }} />
                <IconButton
                  icon="star"
                  label={
                    selected.starred
                      ? "Retirer des favoris"
                      : "Ajouter aux favoris"
                  }
                  color={selected.starred ? "#D99B24" : C.muted}
                  onPress={() =>
                    patch(selected, { starred: !selected.starred })
                  }
                />
                <IconButton
                  icon="mail"
                  label="Marquer non lu"
                  onPress={() => {
                    patch(selected, { unread: true });
                    setSelected(null);
                  }}
                />
                <IconButton
                  icon="archive"
                  label="Archiver"
                  onPress={() => patch(selected, { folder: "archive" })}
                />
                <IconButton
                  icon="trash-2"
                  label="Mettre à la corbeille"
                  onPress={() => patch(selected, { folder: "trash" })}
                />
              </View>
              <ScrollView
                contentContainerStyle={[s.reader, !wide && { padding: 12 }]}
              >
                <View style={[s.readerCard, !wide && { padding: 18 }]}>
                  <Text style={s.subject}>
                    {selected.subject || "(Sans objet)"}
                  </Text>
                  <View style={s.senderLine}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>
                        {nameOf(selected.from).slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text selectable style={s.senderName}>
                        {selected.from}
                      </Text>
                      <Text selectable style={s.meta}>
                        À : {selected.to.join(", ")}
                      </Text>
                      {!!selected.cc?.length && (
                        <Text selectable style={s.meta}>
                          Cc : {selected.cc.join(", ")}
                        </Text>
                      )}
                      {!!selected.bcc?.length && (
                        <Text selectable style={s.meta}>
                          Cci : {selected.bcc.join(", ")}
                        </Text>
                      )}
                      <Text style={s.meta}>
                        {new Date(selected.created_at).toLocaleString("fr-FR")}
                        {selected.kind === "sent" && selected.last_event
                          ? ` · ${selected.last_event}`
                          : ""}
                      </Text>
                    </View>
                  </View>
                  <Text selectable style={s.messageBody}>
                    {selected.text || "(Ce message ne contient pas de texte.)"}
                  </Text>
                  {!!selected.attachments?.length && (
                    <View style={s.attachments}>
                      <Text style={s.label}>
                        {selected.attachments.length} pièce
                        {selected.attachments.length > 1 ? "s" : ""} jointe
                        {selected.attachments.length > 1 ? "s" : ""}
                      </Text>
                      {selected.attachments.map((a) => (
                        <Pressable
                          accessibilityRole="button"
                          key={a.id}
                          onPress={() => download(selected, a)}
                          style={s.attachment}
                        >
                          <Icon name="paperclip" color={C.blue} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.attachmentName}>{a.filename}</Text>
                            <Text style={s.meta}>{size(a.size)}</Text>
                          </View>
                          <Icon name="download" color={C.blue} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <View style={s.readerActions}>
                    {selected.folder === "trash" ||
                    selected.folder === "archive" ? (
                      <Button
                        title="Restaurer"
                        icon="corner-up-left"
                        onPress={() =>
                          patch(selected, {
                            folder: selected.kind === "sent" ? "sent" : "inbox",
                          })
                        }
                      />
                    ) : null}
                    <Button
                      title="Répondre"
                      icon="corner-up-left"
                      onPress={() => reply(selected)}
                      primary
                    />
                    <Button
                      title="À tous"
                      icon="users"
                      onPress={() => reply(selected, true)}
                    />
                    <Button
                      title="Transférer"
                      icon="corner-up-right"
                      onPress={() => forward(selected)}
                    />
                  </View>
                </View>
              </ScrollView>
            </>
          ) : (
            <>
              <View style={[s.heading, !wide && { paddingHorizontal: 20 }]}>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text style={[s.title, !wide && { fontSize: 26 }]}>
                      {folders.find((f) => f.id === folder)?.name}
                    </Text>
                    {folder === "inbox" && !!status?.counts.unread && (
                      <View style={s.unreadBadge}>
                        <Text style={s.unreadBadgeText}>
                          {status.counts.unread} non lu
                          {status.counts.unread > 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.subtitle}>
                    {folder === "inbox"
                      ? "Tes conversations, à leur place."
                      : folder === "drafts"
                        ? "Les idées en cours. Reprends quand tu veux."
                        : folder === "sent"
                          ? "Une trace de chaque message envoyé."
                          : folder === "trash"
                            ? "Les messages retirés de ta boîte. Tu peux les restaurer."
                            : "Garde tes échanges bien organisés."}
                  </Text>
                </View>
                {wide && (
                  <Text style={s.today}>
                    {new Date().toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </Text>
                )}
              </View>
              <View style={[s.mailbox, !wide && { marginHorizontal: 12 }]}>
                <View style={s.listToolbar}>
                  <View style={s.search}>
                    <Icon name="search" size={17} />
                    <TextInput
                      accessibilityLabel="Rechercher un message"
                      placeholder="Rechercher dans les messages…"
                      placeholderTextColor="#929CAD"
                      style={s.searchInput}
                      value={search}
                      onChangeText={setSearch}
                    />
                    {!!search && (
                      <IconButton
                        icon="x"
                        label="Effacer la recherche"
                        onPress={() => setSearch("")}
                      />
                    )}
                  </View>
                  {wide && (
                    <Text style={s.listCount}>
                      {status?.counts[folder] || 0} message
                      {status?.counts[folder] === 1 ? "" : "s"}
                    </Text>
                  )}
                </View>
                {folder === "drafts" ? (
                  <FlatList
                    data={drafts.filter((d) =>
                      [d.subject, d.text, ...d.to]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )}
                    keyExtractor={(d) => d.id}
                    refreshControl={
                      <RefreshControl
                        refreshing={loading}
                        onRefresh={() => refreshRef.current()}
                      />
                    }
                    renderItem={({ item }) => (
                      <Pressable
                        accessibilityRole="button"
                        onPress={async () => {
                          try {
                            setCompose(
                              await api.request<Draft>(`/drafts/${item.id}`),
                            );
                          } catch (e) {
                            report(e);
                          }
                        }}
                        style={s.mailRow}
                      >
                        <View style={s.avatar}>
                          <Icon name="edit-3" color={C.blue} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowSender}>
                            {item.to.join(", ") || "Nouveau message"}
                          </Text>
                          <Text style={s.rowSubject}>
                            {item.subject || "(Sans objet)"}
                          </Text>
                          <Text numberOfLines={1} style={s.preview}>
                            {item.text || "Brouillon vide"}
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Supprimer le brouillon"
                          onPress={async (e) => {
                            e.stopPropagation();
                            try {
                              await api.request(`/drafts/${item.id}`, {
                                method: "DELETE",
                              });
                              refreshRef.current();
                            } catch (e) {
                              report(e);
                            }
                          }}
                          style={s.iconButton}
                        >
                          <Icon name="trash-2" />
                        </Pressable>
                      </Pressable>
                    )}
                    ListEmptyComponent={
                      <Empty
                        folder={folder}
                        search={search}
                        loading={loading}
                      />
                    }
                  />
                ) : (
                  <FlatList
                    data={messages}
                    keyExtractor={(m) => m.id}
                    refreshControl={
                      <RefreshControl
                        refreshing={loading}
                        onRefresh={() => refreshRef.current()}
                      />
                    }
                    renderItem={({ item, index }) => (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openMessage(item)}
                        style={({ pressed }) => [
                          s.mailRow,
                          item.unread && s.mailRowUnread,
                          !wide && { paddingHorizontal: 14 },
                          pressed && { backgroundColor: "#EDF3FF" },
                        ]}
                      >
                        <View
                          style={[
                            s.avatar,
                            {
                              backgroundColor: [
                                "#EBEFFB",
                                "#F7EDE5",
                                "#E6F3EE",
                                "#EEEAF5",
                              ][index % 4],
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.avatarText,
                              {
                                color: [
                                  "#5F70A2",
                                  "#AB8061",
                                  "#4F8A73",
                                  "#8F72A2",
                                ][index % 4],
                              },
                            ]}
                          >
                            {nameOf(
                              folder === "sent" ? item.to[0] || "?" : item.from,
                            )
                              .slice(0, 2)
                              .toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: "row", gap: 10 }}>
                            <Text
                              numberOfLines={1}
                              style={[
                                s.rowSender,
                                { flex: 1 },
                                item.unread && { fontWeight: "700" },
                              ]}
                            >
                              {folder === "sent"
                                ? item.to.join(", ")
                                : nameOf(item.from)}
                            </Text>
                            <Text style={s.rowDate}>
                              {date(item.created_at)}
                            </Text>
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[
                              s.rowSubject,
                              item.unread && {
                                fontWeight: "600",
                                color: C.ink,
                              },
                            ]}
                          >
                            {item.subject || "(Sans objet)"}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {!!item.attachments?.length && (
                              <Icon name="paperclip" size={12} />
                            )}
                            <Text
                              numberOfLines={1}
                              style={[s.preview, { flex: 1 }]}
                            >
                              {item.text?.replace(/\s+/g, " ").trim() ||
                                "Ouvrir le message"}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: "center", gap: 8 }}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              item.starred
                                ? "Retirer des favoris"
                                : "Ajouter aux favoris"
                            }
                            onPress={(e) => {
                              e.stopPropagation();
                              patch(item, { starred: !item.starred });
                            }}
                            style={{ padding: 6 }}
                          >
                            <Icon
                              name="star"
                              size={16}
                              color={item.starred ? "#D99B24" : "#C8D0DD"}
                            />
                          </Pressable>
                          {item.unread && <View style={s.unreadDot} />}
                        </View>
                      </Pressable>
                    )}
                    ListEmptyComponent={
                      <Empty
                        folder={folder}
                        search={search}
                        loading={loading}
                      />
                    }
                    ListFooterComponent={
                      more ? (
                        <View style={{ padding: 15, alignItems: "center" }}>
                          <Button
                            title="Charger les messages suivants"
                            disabled={loading}
                            onPress={() => refresh(true)}
                          />
                        </View>
                      ) : messages.length ? (
                        <Text style={s.endList}>Tu es à jour.</Text>
                      ) : null
                    }
                  />
                )}
              </View>
              <View style={s.bottomNote}>
                <Icon name="shield" size={13} />
                <Text style={s.bottomNoteText}>
                  Ton courrier, sur ton serveur.
                </Text>
                {!wide && <View style={{ flex: 1 }} />}
                {!wide && (
                  <Button
                    title="Écrire"
                    icon="edit-3"
                    primary
                    small
                    onPress={() => newDraft()}
                  />
                )}
              </View>
            </>
          )}
          {busy && (
            <View pointerEvents="none" style={s.busyOverlay}>
              <ActivityIndicator color={C.blue} />
            </View>
          )}
        </View>
      </View>
      <Modal
        visible={menu && !wide}
        animationType="fade"
        transparent
        onRequestClose={() => setMenu(false)}
      >
        <View
          style={{ flex: 1, flexDirection: "row", backgroundColor: "#0008" }}
        >
          {sidebar}
          <Pressable
            accessibilityLabel="Fermer le menu"
            onPress={() => setMenu(false)}
            style={{ flex: 1 }}
          />
        </View>
      </Modal>
      {compose && (
        <Composer
          draft={compose}
          config={config}
          onClose={() => {
            setCompose(null);
            refreshRef.current();
          }}
          onSent={() => {
            setCompose(null);
            setSelected(null);
            setFolder("sent");
            setNotice("Message envoyé");
            refreshRef.current();
          }}
        />
      )}
      {settingsOpen && config && (
        <Preferences
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            loadConfig();
            setNotice("Préférences enregistrées");
          }}
          onLogout={async () => {
            await api.logout();
            setLogged(false);
            setSettingsOpen(false);
            setSelected(null);
            setMessages([]);
            setConfig(null);
            setPassword("");
          }}
        />
      )}
    </SafeAreaView>
  );
}
function Empty({
  folder,
  search,
  loading,
}: {
  folder: Folder;
  search: string;
  loading: boolean;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon
          name={
            search
              ? "search"
              : folders.find((f) => f.id === folder)?.icon || "inbox"
          }
          color={C.blue}
          size={34}
        />
      </View>
      <Text style={s.emptyTitle}>
        {loading
          ? "Un instant…"
          : search
            ? "Aucun résultat"
            : folder === "inbox"
              ? "Un peu de calme dans ta boîte."
              : folder === "drafts"
                ? "Aucun brouillon pour le moment."
                : "Rien ici pour le moment."}
      </Text>
      <Text style={s.emptyText}>
        {search
          ? "Essaie un autre nom, objet ou mot-clé."
          : folder === "inbox"
            ? "Les messages reçus sur ton domaine apparaîtront ici automatiquement."
            : folder === "sent"
              ? "Tes messages envoyés apparaîtront ici."
              : "Tes messages trouveront leur place ici."}
      </Text>
    </View>
  );
}
