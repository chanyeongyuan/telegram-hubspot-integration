import fs from "node:fs";
import path from "node:path";

const DEFAULT_STATE = {
  businessConnections: {},
  channelAccounts: {},
  hubspotTokens: null,
  processedHubSpotEventIds: [],
  messageMappings: {}
};

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = this.load();
  }

  getBusinessConnection(connectionId) {
    return this.state.businessConnections[String(connectionId)] || null;
  }

  listBusinessConnections() {
    return Object.values(this.state.businessConnections).sort((a, b) =>
      String(a.businessAccountName || a.id).localeCompare(String(b.businessAccountName || b.id))
    );
  }

  upsertBusinessConnection(connection) {
    this.state.businessConnections[connection.id] = {
      ...(this.state.businessConnections[connection.id] || {}),
      ...connection,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.businessConnections[connection.id];
  }

  upsertChannelAccount(account) {
    this.state.channelAccounts[account.id] = {
      ...(this.state.channelAccounts[account.id] || {}),
      ...account,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.state.channelAccounts[account.id];
  }

  markChannelAccountPurged(channelAccountId) {
    const existing = this.state.channelAccounts[String(channelAccountId)];
    if (existing) {
      existing.active = false;
      existing.purgedAt = new Date().toISOString();
      this.save();
    }
  }

  getChannelAccountForConnection(connectionId) {
    return (
      Object.values(this.state.channelAccounts).find(
        (account) => account.connectionId === String(connectionId) && account.active !== false
      ) || null
    );
  }

  getHubSpotTokens() {
    return this.state.hubspotTokens || null;
  }

  setHubSpotTokens(tokens) {
    this.state.hubspotTokens = tokens;
    this.save();
  }

  hasProcessedHubSpotEvent(eventId) {
    return Boolean(eventId && this.state.processedHubSpotEventIds.includes(eventId));
  }

  markHubSpotEventProcessed(eventId) {
    if (!eventId || this.hasProcessedHubSpotEvent(eventId)) {
      return;
    }

    this.state.processedHubSpotEventIds.push(eventId);
    this.state.processedHubSpotEventIds = this.state.processedHubSpotEventIds.slice(-500);
    this.save();
  }

  recordMessageMapping({ hubSpotMessageId, telegramMessageId, connectionId, chatId }) {
    if (!hubSpotMessageId) {
      return;
    }

    this.state.messageMappings[hubSpotMessageId] = {
      hubSpotMessageId,
      telegramMessageId,
      connectionId,
      chatId,
      recordedAt: new Date().toISOString()
    };
    this.save();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return structuredClone(DEFAULT_STATE);
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        businessConnections: parsed.businessConnections || {},
        channelAccounts: parsed.channelAccounts || {},
        processedHubSpotEventIds: parsed.processedHubSpotEventIds || [],
        messageMappings: parsed.messageMappings || {}
      };
    } catch (error) {
      throw new Error(`Could not read state file ${this.filePath}: ${error.message}`);
    }
  }

  save() {
    if (!this.filePath) {
      return;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }
}

export function normalizeChannelAccountEvent(event) {
  if (!event?.channelAccountId) {
    return null;
  }

  const deliveryIdentifier = normalizeDeliveryIdentifier(event.channelAccountDeliveryIdentifier);
  const connectionId = deliveryIdentifier?.value?.startsWith("tg-business:")
    ? deliveryIdentifier.value.slice("tg-business:".length)
    : "";

  return {
    id: String(event.channelAccountId),
    portalId: String(event.portalId || ""),
    channelId: String(event.channelId || ""),
    deliveryIdentifier,
    connectionId,
    active: event.type !== "CHANNEL_ACCOUNT_PURGED",
    eventType: event.type,
    eventTimestamp: event.eventTimestamp || new Date().toISOString()
  };
}

function normalizeDeliveryIdentifier(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return {
      type: "CHANNEL_SPECIFIC_OPAQUE_ID",
      value
    };
  }

  if (value.value) {
    return {
      type: value.type || "CHANNEL_SPECIFIC_OPAQUE_ID",
      value: String(value.value)
    };
  }

  return null;
}
