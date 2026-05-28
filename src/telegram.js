const CUSTOMER_DELIVERY_PREFIX = "tg-chat:";
const BUSINESS_DELIVERY_PREFIX = "tg-business:";

const TELEGRAM_ATTACHMENT_FIELDS = [
  "photo",
  "video",
  "animation",
  "audio",
  "voice",
  "video_note",
  "document",
  "sticker",
  "contact",
  "location",
  "venue"
];

export function buildCustomerDeliveryIdentifier(connectionId, chatId) {
  return `${CUSTOMER_DELIVERY_PREFIX}${encodeIdentifierPart(connectionId)}:${encodeIdentifierPart(chatId)}`;
}

export function buildBusinessDeliveryIdentifier(connectionId) {
  return `${BUSINESS_DELIVERY_PREFIX}${encodeIdentifierPart(connectionId)}`;
}

export function parseCustomerDeliveryIdentifier(value) {
  if (typeof value !== "string" || !value.startsWith(CUSTOMER_DELIVERY_PREFIX)) {
    return null;
  }

  const raw = value.slice(CUSTOMER_DELIVERY_PREFIX.length);
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const connectionId = decodeIdentifierPart(raw.slice(0, separatorIndex));
  const chatId = decodeIdentifierPart(raw.slice(separatorIndex + 1));
  if (!connectionId || !chatId) {
    return null;
  }

  return { connectionId, chatId };
}

export function parseBusinessDeliveryIdentifier(value) {
  if (typeof value !== "string" || !value.startsWith(BUSINESS_DELIVERY_PREFIX)) {
    return null;
  }

  const connectionId = decodeIdentifierPart(value.slice(BUSINESS_DELIVERY_PREFIX.length));
  return connectionId ? { connectionId } : null;
}

export function normalizeBusinessConnectionUpdate(update) {
  const connection = update?.business_connection;
  if (!connection?.id) {
    return null;
  }

  return {
    id: String(connection.id),
    businessAccountUserId: connection.user?.id ? String(connection.user.id) : "",
    userChatId: connection.user_chat_id ? String(connection.user_chat_id) : "",
    businessAccountName: formatTelegramName(connection.user) || "Telegram Business",
    rights: connection.rights || {},
    isEnabled: Boolean(connection.is_enabled),
    connectedAt: connection.date ? new Date(connection.date * 1000).toISOString() : new Date().toISOString()
  };
}

export function normalizeBusinessMessageUpdate(update, connection = {}) {
  const message = update?.business_message;
  if (!message?.business_connection_id || !message?.chat?.id || !message?.message_id) {
    return null;
  }

  if (message.chat.type !== "private") {
    return null;
  }

  const businessAccountUserId = normalizeOptionalId(connection.businessAccountUserId || connection.user?.id);
  const senderUserId = normalizeOptionalId(message.from?.id);
  if (businessAccountUserId && senderUserId === businessAccountUserId) {
    return null;
  }

  if (message.sender_business_bot) {
    return null;
  }

  const connectionId = String(message.business_connection_id);
  const chatId = String(message.chat.id);
  const attachmentTypes = extractAttachmentTypes(message);

  return {
    connectionId,
    chatId,
    messageId: String(message.message_id),
    timestamp: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
    text: String(message.text || message.caption || "").trim(),
    senderName: formatTelegramName(message.from) || formatTelegramName(message.chat) || `Telegram chat ${chatId}`,
    attachmentTypes,
    senderDeliveryIdentifier: buildCustomerDeliveryIdentifier(connectionId, chatId),
    recipientDeliveryIdentifier: buildBusinessDeliveryIdentifier(connectionId)
  };
}

export function normalizeDeletedBusinessMessages(update) {
  const deleted = update?.deleted_business_messages;
  if (!deleted?.business_connection_id || !deleted?.chat?.id || !Array.isArray(deleted.message_ids)) {
    return null;
  }

  return {
    connectionId: String(deleted.business_connection_id),
    chatId: String(deleted.chat.id),
    messageIds: deleted.message_ids.map((id) => String(id))
  };
}

export class TelegramClient {
  constructor({ botToken, fetchImpl = globalThis.fetch }) {
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    if (!fetchImpl) {
      throw new Error("fetch is not available");
    }

    this.botToken = botToken;
    this.fetchImpl = fetchImpl;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async setWebhook({ webhookUrl, secretToken, dropPendingUpdates = false }) {
    return this.call("setWebhook", {
      url: webhookUrl,
      secret_token: secretToken || undefined,
      allowed_updates: [
        "business_connection",
        "business_message",
        "edited_business_message",
        "deleted_business_messages"
      ],
      drop_pending_updates: dropPendingUpdates
    });
  }

  async getWebhookInfo() {
    return this.call("getWebhookInfo", {});
  }

  async getBusinessConnection(connectionId) {
    return this.call("getBusinessConnection", {
      business_connection_id: connectionId
    });
  }

  async sendMessage({ connectionId, chatId, text }) {
    return this.call("sendMessage", {
      business_connection_id: connectionId,
      chat_id: chatId,
      text
    });
  }

  async call(method, body) {
    const response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stripUndefined(body))
    });
    const data = await readTelegramJson(response);

    if (!response.ok || data.ok === false) {
      const description = data.description || `${response.status} ${response.statusText}`;
      throw new Error(`Telegram ${method} failed: ${description}`);
    }

    return data.result;
  }
}

function extractAttachmentTypes(message) {
  return TELEGRAM_ATTACHMENT_FIELDS.filter((field) => Boolean(message[field]));
}

function formatTelegramName(entity = {}) {
  const name = [entity.first_name, entity.last_name].filter(Boolean).join(" ").trim();
  if (name && entity.username) {
    return `${name} (@${entity.username})`;
  }
  if (name) {
    return name;
  }
  if (entity.username) {
    return `@${entity.username}`;
  }
  if (entity.title) {
    return entity.title;
  }
  return "";
}

function encodeIdentifierPart(value) {
  return encodeURIComponent(String(value));
}

function decodeIdentifierPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function normalizeOptionalId(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return String(value);
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

async function readTelegramJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Telegram returned non-JSON response: ${text.slice(0, 200)}`);
  }
}
