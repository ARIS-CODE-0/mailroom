import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "./api";
import { C, s } from "./styles";
import { Button, IconButton, Icon, Input, recipientList, size } from "./ui";
import type { Draft, Config, Attachment, Settings } from "./types";

export function Composer({
  draft,
  config,
  onClose,
  onSent,
}: {
  draft: Draft;
  config: Config | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [from, setFrom] = useState(draft.from),
    [to, setTo] = useState(draft.to.join(", ")),
    [cc, setCc] = useState(draft.cc.join(", ")),
    [bcc, setBcc] = useState(draft.bcc.join(", ")),
    [subject, setSubject] = useState(draft.subject),
    [text, setText] = useState(draft.text),
    [attachments, setAttachments] = useState(draft.attachments);
  const [showCopies, setShowCopies] = useState(!!(cc || bcc)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("Brouillon");
  const dirty = useRef(false),
    closing = useRef(false),
    saveQueue = useRef<Promise<any>>(Promise.resolve());
  const payload = useCallback(
    () => ({
      id: draft.id,
      from,
      to: recipientList(to),
      cc: recipientList(cc),
      bcc: recipientList(bcc),
      subject,
      text,
      attachments,
      replyToId: draft.replyToId,
    }),
    [draft.id, draft.replyToId, from, to, cc, bcc, subject, text, attachments],
  );
  const save = useCallback(() => {
    const snapshot = payload();
    const task = saveQueue.current
      .catch(() => {})
      .then(() =>
        api.request(`/drafts/${draft.id}`, {
          method: "PUT",
          body: JSON.stringify(snapshot),
        }),
      );
    saveQueue.current = task;
    return task;
  }, [draft.id, payload]);
  useEffect(() => {
    if (!dirty.current) {
      dirty.current = true;
      return;
    }
    setSaved("Modification en cours…");
    const timer = setTimeout(() => {
      if (!closing.current)
        save()
          .then(() => setSaved("Brouillon enregistré"))
          .catch(() => setSaved("À enregistrer · vérifie les adresses"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [save]);
  const bytes = attachments.reduce(
    (n, a) => n + (a.size ?? Math.floor(((a.content?.length || 0) * 3) / 4)),
    0,
  );
  async function pick() {
    setError("");
    try {
      const r = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      const files: Attachment[] = [];
      let total = bytes;
      for (const f of r.assets) {
        total += f.size || 0;
        if (total > 25 * 1024 * 1024)
          throw new Error("Maximum 25 Mo de pièces jointes par message.");
        const content =
          Platform.OS === "web" && f.file
            ? await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(f.file!);
              })
            : await FileSystem.readAsStringAsync(f.uri, {
                encoding: FileSystem.EncodingType.Base64,
              });
        files.push({
          filename: f.name,
          content,
          content_type: f.mimeType || "application/octet-stream",
          size: f.size,
        });
      }
      if (attachments.length + files.length > 20)
        throw new Error("Maximum 20 pièces jointes.");
      setAttachments((prev) => [...prev, ...files]);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function close() {
    setBusy(true);
    closing.current = true;
    try {
      await save();
      onClose();
    } catch (e: any) {
      closing.current = false;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    setBusy(true);
    closing.current = true;
    try {
      await saveQueue.current.catch(() => {});
      await api.request(`/drafts/${draft.id}`, { method: "DELETE" });
      onClose();
    } catch (e: any) {
      closing.current = false;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setError("");
    setBusy(true);
    closing.current = true;
    try {
      await save();
      await api.request("/send", {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      onSent();
    } catch (e: any) {
      closing.current = false;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) close();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.modalOverlay}
      >
        <SafeAreaView style={s.composer}>
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalTitle}>Nouveau message</Text>
              <Text style={s.meta}>{saved}</Text>
            </View>
            <IconButton
              icon="x"
              label="Fermer et enregistrer"
              onPress={() => {
                if (!busy) close();
              }}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.composeFields}
          >
            <Input
              label="De"
              value={from}
              onChangeText={setFrom}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            {!!config?.settings.identities.length && (
              <ScrollView horizontal contentContainerStyle={{ gap: 7 }}>
                {config.settings.identities.map((i) => (
                  <Pressable
                    key={i.email}
                    disabled={busy}
                    onPress={() =>
                      setFrom(i.name ? `${i.name} <${i.email}>` : i.email)
                    }
                    style={s.chip}
                  >
                    <Text style={s.chipText}>{i.email}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View style={{ flex: 1 }}>
                <Input
                  label="À"
                  placeholder="destinataire@exemple.fr"
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!busy}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cc / Cci"
                onPress={() => setShowCopies((v) => !v)}
                style={{ padding: 8, marginTop: 20 }}
              >
                <Text style={s.link}>Cc / Cci</Text>
              </Pressable>
            </View>
            {showCopies && (
              <>
                <Input
                  label="Cc"
                  placeholder="Copie visible"
                  value={cc}
                  onChangeText={setCc}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!busy}
                />
                <Input
                  label="Cci"
                  placeholder="Copie cachée"
                  value={bcc}
                  onChangeText={setBcc}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!busy}
                />
              </>
            )}
            <Input
              label="Objet"
              placeholder="De quoi parle-t-on ?"
              value={subject}
              onChangeText={setSubject}
              editable={!busy}
            />
            <TextInput
              accessibilityLabel="Message"
              multiline
              placeholder="Écris ton message ici…"
              placeholderTextColor="#99A3B0"
              value={text}
              onChangeText={setText}
              editable={!busy}
              style={s.bodyInput}
              textAlignVertical="top"
            />
            {attachments.map((a, i) => (
              <View key={`${i}-${a.filename}`} style={s.attachment}>
                <Icon name="paperclip" color={C.blue} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={s.attachmentName}>
                    {a.filename}
                  </Text>
                  <Text style={s.meta}>{size(a.size)}</Text>
                </View>
                <IconButton
                  icon="x"
                  label={`Retirer ${a.filename}`}
                  onPress={() => {
                    if (!busy)
                      setAttachments((prev) => prev.filter((_, n) => n !== i));
                  }}
                />
              </View>
            ))}
            {!!error && (
              <Text accessibilityRole="alert" style={s.errorText}>
                {error}
              </Text>
            )}
          </ScrollView>
          <View style={s.composeFooter}>
            <Button
              title={busy ? "Patiente…" : "Envoyer"}
              icon="send"
              primary
              disabled={busy}
              onPress={send}
            />
            <IconButton
              icon="paperclip"
              label="Joindre des fichiers"
              onPress={() => {
                if (!busy) pick();
              }}
            />
            <Text style={[s.meta, { flex: 1 }]}>
              {bytes ? `${size(bytes)} / 25 Mo` : ""}
            </Text>
            <IconButton
              icon="trash-2"
              label="Abandonner le brouillon"
              onPress={() => {
                if (!busy) discard();
              }}
            />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Preferences({
  config,
  onClose,
  onSaved,
  onLogout,
}: {
  config: Config;
  onClose: () => void;
  onSaved: () => void;
  onLogout: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<Settings>(config.settings),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.request("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <SafeAreaView style={[s.composer, { maxWidth: 600 }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Adresses & préférences</Text>
            <IconButton
              icon="x"
              label="Fermer les préférences"
              onPress={onClose}
            />
          </View>
          <ScrollView contentContainerStyle={s.composeFields}>
            <Text style={s.settingsTitle}>Ton domaine</Text>
            {config.domains.map((d) => (
              <View key={d.name} style={s.domainStatus}>
                <Icon name="check-circle" color={C.green} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowSender}>{d.name}</Text>
                  <Text style={s.meta}>
                    Envoi :{" "}
                    {d.capabilities?.sending === "enabled"
                      ? "activé"
                      : "à configurer"}{" "}
                    · Réception :{" "}
                    {d.capabilities?.receiving === "enabled"
                      ? "activée"
                      : "à configurer"}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={s.settingsTitle}>Tes adresses d’expédition</Text>
            <Text style={s.meta}>
              Ajoute tes adresses préférées. Tu peux aussi saisir une autre
              adresse de ton domaine à chaque envoi.
            </Text>
            {settings.identities.map((i, n) => (
              <View key={n} style={s.identityEditor}>
                <Input
                  label="Nom affiché"
                  value={i.name}
                  placeholder="Ton nom"
                  onChangeText={(name) =>
                    setSettings({
                      ...settings,
                      identities: settings.identities.map((x, k) =>
                        k === n ? { ...x, name } : x,
                      ),
                    })
                  }
                />
                <Input
                  label="Adresse mail"
                  value={i.email}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder={`bonjour@${config.domains[0]?.name}`}
                  onChangeText={(email) =>
                    setSettings({
                      ...settings,
                      identities: settings.identities.map((x, k) =>
                        k === n ? { ...x, email } : x,
                      ),
                    })
                  }
                />
                <Button
                  title="Retirer cette adresse"
                  icon="minus"
                  small
                  onPress={() =>
                    setSettings({
                      ...settings,
                      identities: settings.identities.filter((_, k) => k !== n),
                    })
                  }
                />
              </View>
            ))}
            <Button
              title="Ajouter une adresse"
              icon="plus"
              onPress={() =>
                setSettings({
                  ...settings,
                  identities: [...settings.identities, { email: "", name: "" }],
                })
              }
            />
            <Input
              label="Signature"
              multiline
              value={settings.signature}
              onChangeText={(signature) =>
                setSettings({ ...settings, signature })
              }
              style={{ minHeight: 100, textAlignVertical: "top" }}
              placeholder="La touche finale à tes messages."
            />
            {!!error && <Text style={s.errorText}>{error}</Text>}
            <Button
              title="Se déconnecter"
              icon="log-out"
              onPress={() => onLogout().catch((e) => setError(e.message))}
            />
          </ScrollView>
          <View style={s.composeFooter}>
            <Button
              title="Enregistrer"
              primary
              icon="check"
              disabled={busy}
              onPress={save}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
