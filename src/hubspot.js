import { parseCustomerDeliveryIdentifier } from "./telegram.js";

const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const OPAQUE_IDENTIFIER_TYPE = "CHANNEL_SPECIFIC_OPAQUE_ID";

export function buildIncomingMessagePayload(message, options) {
  const text = buildHubSpotText(message.text, message.attachmentTypes);

  return {
    attachments: message.attachmentTypes.length > 0 ? [{ type: "UNSUPPORTED_CONTENT" }] : [],
    channelAccountId: options.channelAccountId,
    messageDirection: "INCOMING",
    recipients: [
      {
        deliveryIdentifier: {
          type: OPAQUE_IDENTIFIER_TYPE,
          value: message.recipientDeliveryIdentifier
        },
        name: options.businessAccountName || "Telegram Business"
      }
    ],
    senders: [
      {
        deliveryIdentifier: {
          type: OPAQUE_IDENTIFIER_TYPE,
          value: message.senderDeliveryIdentifier
        },
        name: message.senderName
      }
    ],
    text,
    timestamp: message.timestamp,
    integrationIdempotencyId: `telegram:${message.connectionId}:${message.chatId}:${message.messageId}`,
    integrationThreadId:
      options.threadingModel === "INTEGRATION_THREAD_ID" ? `telegram:${message.connectionId}:${message.chatId}` : null
  };
}

export function extractOutgoingTelegramMessage(event) {
  if (event?.type !== "OUTGOING_CHANNEL_MESSAGE_CREATED") {
    return null;
  }

  const message = event.message || {};
  const recipient = (message.recipients || []).find((entry) =>
    parseCustomerDeliveryIdentifier(entry?.deliveryIdentifier?.value)
  );
  const destination = parseCustomerDeliveryIdentifier(recipient?.deliveryIdentifier?.value);
  const text = String(message.text || stripHtml(message.richText || "")).trim();

  if (!destination || !text) {
    return null;
  }

  return {
    eventId: String(event.eventId || message.id || ""),
    hubSpotMessageId: String(message.id || ""),
    connectionId: destination.connectionId,
    chatId: destination.chatId,
    text
  };
}

export function buildRegisterChannelPayload(options) {
  const publicBaseUrl = trimTrailingSlash(options.publicBaseUrl);
  const payload = {
    name: options.channelName || "Telegram Business",
    webhookUrl: `${publicBaseUrl}/webhooks/hubspot`,
    capabilities: {
      deliveryIdentifierTypes: [OPAQUE_IDENTIFIER_TYPE],
      richText: [],
      allowInlineImages: false,
      allowOutgoingMessages: true,
      outgoingAttachmentTypes: [],
      allowedFileAttachmentMimeTypes: [],
      maxFileAttachmentCount: 0,
      maxFileAttachmentSizeBytes: 0,
      maxTotalFileAttachmentSizeBytes: 0,
      threadingModel: "DELIVERY_IDENTIFIER"
    },
    channelAccountConnectionRedirectUrl: `${publicBaseUrl}/hubspot/channel-account/setup`,
    channelDescription: options.channelDescription || "Route Telegram Business 1:1 enquiries into HubSpot."
  };

  if (options.logoUrl) {
    payload.channelLogoUrl = options.logoUrl;
  }

  return payload;
}

export function buildChannelAccountPayload({ inboxId, accountName, connectionId }) {
  return {
    inboxId: String(inboxId),
    name: accountName || "Telegram Business",
    deliveryIdentifier: {
      type: OPAQUE_IDENTIFIER_TYPE,
      value: `tg-business:${connectionId}`
    },
    authorized: true
  };
}

export function buildStagingTokenPayload({ accountName, connectionId }) {
  return {
    accountName: accountName || "Telegram Business",
    deliveryIdentifier: {
      type: OPAQUE_IDENTIFIER_TYPE,
      value: `tg-business:${connectionId}`
    }
  };
}

export class HubSpotClient {
  constructor({ accessTokenProvider, accessToken, fetchImpl = globalThis.fetch }) {
    if (!accessTokenProvider && !accessToken) {
      throw new Error("A HubSpot access token or access token provider is required");
    }
    if (!fetchImpl) {
      throw new Error("fetch is not available");
    }

    this.accessTokenProvider = accessTokenProvider || (() => accessToken);
    this.fetchImpl = fetchImpl;
  }

  async publishMessage(channelId, payload) {
    return this.request(`/conversations/v3/custom-channels/${channelId}/messages`, {
      method: "POST",
      body: payload
    });
  }

  async createChannelAccount(channelId, payload) {
    return this.request(`/conversations/v3/custom-channels/${channelId}/channel-accounts`, {
      method: "POST",
      body: payload
    });
  }

  async updateChannelAccountStagingToken(channelId, accountToken, payload) {
    return this.request(`/conversations/v3/custom-channels/${channelId}/channel-account-staging-tokens/${accountToken}`, {
      method: "PATCH",
      body: payload
    });
  }

  async request(path, options = {}) {
    const token = await this.accessTokenProvider();
    const response = await this.fetchImpl(`${HUBSPOT_BASE_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await readHubSpotJson(response);

    if (!response.ok) {
      const message = data.message || data.error || `${response.status} ${response.statusText}`;
      throw new Error(`HubSpot request failed: ${message}`);
    }

    return data;
  }
}

export class HubSpotOAuthTokenProvider {
  constructor({ clientId, clientSecret, redirectUri, stateStore, staticAccessToken, fetchImpl = globalThis.fetch }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.stateStore = stateStore;
    this.staticAccessToken = staticAccessToken;
    this.fetchImpl = fetchImpl;
  }

  getAuthorizationUrl({ scopes, state }) {
    const url = new URL("https://app.hubspot.com/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("scope", scopes.join(" "));
    if (state) {
      url.searchParams.set("state", state);
    }
    return url.toString();
  }

  async exchangeCode(code) {
    return this.exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri
    });
  }

  async getAccessToken() {
    if (this.staticAccessToken) {
      return this.staticAccessToken;
    }

    const tokens = this.stateStore.getHubSpotTokens();
    if (!tokens?.accessToken) {
      throw new Error("HubSpot OAuth is not connected yet");
    }

    if (tokens.expiresAt && Date.now() < tokens.expiresAt - 60_000) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      throw new Error("HubSpot OAuth refresh token is missing");
    }

    const refreshed = await this.exchangeToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken
    });
    return refreshed.accessToken;
  }

  async exchangeToken(fields) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET are required for OAuth");
    }

    const form = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...fields
    });

    const response = await this.fetchImpl("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const data = await readHubSpotJson(response);

    if (!response.ok) {
      throw new Error(`HubSpot OAuth failed: ${data.message || data.error || response.statusText}`);
    }

    const tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.stateStore.getHubSpotTokens()?.refreshToken || "",
      expiresAt: Date.now() + Number(data.expires_in || 1800) * 1000,
      updatedAt: new Date().toISOString()
    };
    this.stateStore.setHubSpotTokens(tokens);
    return tokens;
  }
}

function buildHubSpotText(text, attachmentTypes) {
  if (text) {
    return text;
  }
  if (attachmentTypes.length === 1) {
    return `[Telegram attachment: ${attachmentTypes[0]}]`;
  }
  if (attachmentTypes.length > 1) {
    return `[Telegram attachments: ${attachmentTypes.join(", ")}]`;
  }
  return "[Telegram message with no text]";
}

function stripHtml(value) {
  return String(value).replace(/<[^>]+>/g, " ");
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function readHubSpotJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HubSpot returned non-JSON response: ${text.slice(0, 200)}`);
  }
}
