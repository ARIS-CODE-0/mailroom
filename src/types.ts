export type Attachment = {
  id?: string;
  filename: string;
  content?: string;
  content_type?: string;
  size?: number;
};
export type Message = {
  id: string;
  kind: "received" | "sent";
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  created_at: string;
  unread: boolean;
  starred: boolean;
  folder: string;
  attachments: Attachment[];
  reply_to?: string[];
  last_event?: string;
};
export type Draft = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  attachments: Attachment[];
  replyToId?: string;
  updated?: string;
};
export type Settings = {
  identities: { email: string; name: string }[];
  signature: string;
};
export type Domain = {
  name: string;
  status: string;
  capabilities?: { sending: string; receiving: string };
};
export type SyncStatus = {
  running: boolean;
  lastSync: string | null;
  error: string | null;
  counts: Record<string, number>;
};
export type Config = {
  domains: Domain[];
  settings: Settings;
  sync: SyncStatus;
  maxAttachmentBytes: number;
};
