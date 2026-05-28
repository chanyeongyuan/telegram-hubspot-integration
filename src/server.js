import http from "node:http";
import { URLSearchParams } from "node:url";

import { loadConfig, loadDotEnv, getReadiness } from "./config.js";
import {
  buildIncomingMessagePayload,
  buildStagingTokenPayload,
  extractOutgoingTelegramMessage,
  HubSpotClient,
  HubSpotOAuthTokenProvider
} from "./hubspot.js";
import { verifyHubSpotSignatureV3, verifyTelegramSecret } from "./security.js";
import { StateStore, normalizeChannelAccountEvent } from "./state.js";
import {
  normalizeBusinessConnectionUpdate,
  normalizeBusinessMessageUpdate,
  normalizeDeletedBusinessMessages,
  TelegramClient
} from "./telegram.js";

loadDotEnv();

const config = loadConfig();
const stateStore = new StateStore(config.stateFilePath);
const telegramClient = config.telegram.botToken ? new TelegramClient({ botToken: config.telegram.botToken }) : null;
const tokenProvider = new HubSpotOAuthTokenProvider({
  clientId: config.hubspot.clientId,
  clientSecret: config.hubspot.clientSecret,
  redirectUri: `${config.publicBaseUrl}/hubspot/oauth/callback`,
  stateStore,
  staticAccessToken: config.hubspot.staticAccessToken
});
const hubSpotClient = new HubSpotClient({
  accessTokenProvider: () => tokenProvider.getAccessToken()
});

export const app = http.createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, error: error.message });
  }
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  app.listen(config.port, () => {
    console.log(`Telegram HubSpot integration listening on ${config.port}`);
  });
}

async function route(request, response) {
  const url = new URL(request.url, config.publicBaseUrl || `http://localhost:${config.port}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/readiness") {
    const readiness = getReadiness(config, stateStore);
    sendJson(response, readiness.ok ? 200 : 503, readiness);
    return;
  }

  if (request.method === "GET" && url.pathname === "/hubspot/oauth/start") {
    handleOAuthStart(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/hubspot/oauth/callback") {
    await handleOAuthCallback(url, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/hubspot/channel-account/setup") {
    sendHtml(response, 200, renderChannelAccountSetup(url));
    return;
  }

  if (request.method === "POST" && url.pathname === "/hubspot/channel-account/setup") {
    await handleChannelAccountSetup(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/webhooks/telegram") {
    await handleTelegramWebhook(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/webhooks/hubspot") {
    await handleHubSpotWebhook(request, response);
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found" });
}

function handleOAuthStart(response) {
  if (!config.hubspot.clientId || !config.publicBaseUrl) {
    sendJson(response, 503, { ok: false, error: "HUBSPOT_CLIENT_ID and PUBLIC_BASE_URL are required" });
    return;
  }

  response.writeHead(302, {
    location: tokenProvider.getAuthorizationUrl({
      scopes: config.hubspot.oauthScopes,
      state: "telegram-hubspot"
    })
  });
  response.end();
}

async function handleOAuthCallback(url, response) {
  const code = url.searchParams.get("code");
  if (!code) {
    sendHtml(response, 400, renderMessagePage("HubSpot OAuth failed", "Missing authorization code."));
    return;
  }

  await tokenProvider.exchangeCode(code);
  sendHtml(response, 200, renderMessagePage("HubSpot connected", "OAuth tokens were saved for this service."));
}

async function handleChannelAccountSetup(request, response) {
  const rawBody = await readRawBody(request);
  const form = new URLSearchParams(rawBody);
  const accountToken = form.get("accountToken");
  const channelId = form.get("channelId") || config.hubspot.channelId;
  const connectionId = form.get("connectionId");
  const accountName = form.get("accountName") || config.hubspot.businessAccountName;
  const redirectUrl = form.get("redirectUrl");

  if (!accountToken || !channelId || !connectionId) {
    sendHtml(response, 400, renderMessagePage("Missing details", "Choose a Telegram Business connection first."));
    return;
  }

  await hubSpotClient.updateChannelAccountStagingToken(
    channelId,
    accountToken,
    buildStagingTokenPayload({ accountName, connectionId })
  );

  if (redirectUrl) {
    response.writeHead(302, { location: redirectUrl });
    response.end();
    return;
  }

  sendHtml(response, 200, renderMessagePage("Channel account connected", "You can close this window."));
}

async function handleTelegramWebhook(request, response) {
  if (!verifyTelegramSecret(request.headers, config.telegram.webhookSecret)) {
    sendJson(response, 401, { ok: false, error: "Invalid Telegram webhook secret" });
    return;
  }

  const update = JSON.parse(await readRawBody(request) || "{}");

  const connection = normalizeBusinessConnectionUpdate(update);
  if (connection) {
    stateStore.upsertBusinessConnection(connection);
    sendJson(response, 200, { ok: true, type: "business_connection", connectionId: connection.id });
    return;
  }

  const deleted = normalizeDeletedBusinessMessages(update);
  if (deleted) {
    sendJson(response, 200, { ok: true, type: "deleted_business_messages", ignored: true });
    return;
  }

  if (update.edited_business_message) {
    sendJson(response, 200, { ok: true, type: "edited_business_message", ignored: true });
    return;
  }

  const connectionId = update.business_message?.business_connection_id;
  const connectionInfo = connectionId ? await getBusinessConnectionInfo(connectionId) : null;
  const normalized = normalizeBusinessMessageUpdate(update, connectionInfo || {});
  if (!normalized) {
    sendJson(response, 200, { ok: true, ignored: true });
    return;
  }

  const channelAccountId = getChannelAccountId(normalized.connectionId);
  if (!channelAccountId) {
    sendJson(response, 503, {
      ok: false,
      error: "No HubSpot channel account is connected for this Telegram Business connection"
    });
    return;
  }

  const payload = buildIncomingMessagePayload(normalized, {
    channelAccountId,
    businessAccountName:
      config.hubspot.businessAccountName || connectionInfo?.businessAccountName || "Telegram Business",
    threadingModel: "DELIVERY_IDENTIFIER"
  });
  const result = await hubSpotClient.publishMessage(config.hubspot.channelId, payload);

  stateStore.recordMessageMapping({
    hubSpotMessageId: result.id,
    telegramMessageId: normalized.messageId,
    connectionId: normalized.connectionId,
    chatId: normalized.chatId
  });

  sendJson(response, 200, { ok: true, type: "business_message", hubSpotMessageId: result.id });
}

async function handleHubSpotWebhook(request, response) {
  const rawBody = await readRawBody(request);
  const publicRequestUrl = new URL(
    request.url,
    config.publicBaseUrl || `https://${request.headers.host || "localhost"}`
  ).toString();

  if (
    !verifyHubSpotSignatureV3(
      request.headers,
      {
        method: request.method,
        url: publicRequestUrl,
        rawBody
      },
      config.hubspot.clientSecret
    )
  ) {
    sendJson(response, 401, { ok: false, error: "Invalid HubSpot signature" });
    return;
  }

  const event = JSON.parse(rawBody || "{}");
  if (["CHANNEL_ACCOUNT_CREATED", "CHANNEL_ACCOUNT_UPDATED"].includes(event.type)) {
    const account = normalizeChannelAccountEvent(event);
    if (account) {
      stateStore.upsertChannelAccount(account);
    }
    sendJson(response, 200, { ok: true, type: event.type });
    return;
  }

  if (event.type === "CHANNEL_ACCOUNT_PURGED") {
    stateStore.markChannelAccountPurged(event.channelAccountId);
    sendJson(response, 200, { ok: true, type: event.type });
    return;
  }

  const outgoing = extractOutgoingTelegramMessage(event);
  if (!outgoing) {
    sendJson(response, 200, { ok: true, ignored: true });
    return;
  }

  if (stateStore.hasProcessedHubSpotEvent(outgoing.eventId)) {
    sendJson(response, 200, { ok: true, duplicate: true });
    return;
  }

  if (!telegramClient) {
    sendJson(response, 503, { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" });
    return;
  }

  const telegramMessage = await telegramClient.sendMessage(outgoing);
  stateStore.markHubSpotEventProcessed(outgoing.eventId);
  stateStore.recordMessageMapping({
    hubSpotMessageId: outgoing.hubSpotMessageId,
    telegramMessageId: telegramMessage.message_id,
    connectionId: outgoing.connectionId,
    chatId: outgoing.chatId
  });
  sendJson(response, 200, { ok: true, telegramMessageId: telegramMessage.message_id });
}

async function getBusinessConnectionInfo(connectionId) {
  const existing = stateStore.getBusinessConnection(connectionId);
  if (existing) {
    return existing;
  }

  if (!telegramClient) {
    return null;
  }

  const connection = normalizeBusinessConnectionUpdate({
    business_connection: await telegramClient.getBusinessConnection(connectionId)
  });
  if (connection) {
    return stateStore.upsertBusinessConnection(connection);
  }
  return null;
}

function getChannelAccountId(connectionId) {
  return config.hubspot.channelAccountId || stateStore.getChannelAccountForConnection(connectionId)?.id || "";
}

function renderChannelAccountSetup(url) {
  const connections = stateStore.listBusinessConnections();
  const hiddenFields = ["accountToken", "channelId", "inboxId", "portalId", "redirectUrl"]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(url.searchParams.get(name) || "")}">`)
    .join("\n");
  const options = connections
    .map(
      (connection) =>
        `<option value="${escapeHtml(connection.id)}">${escapeHtml(connection.businessAccountName)} (${escapeHtml(
          connection.id
        )})</option>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Telegram Business</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; color: #1f2937; }
    label { display: block; font-weight: 650; margin: 16px 0 6px; }
    input, select, button { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; }
    button { margin-top: 20px; background: #2563eb; color: white; border: 0; border-radius: 6px; cursor: pointer; }
    .note { color: #4b5563; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>Connect Telegram Business</h1>
  <p class="note">Choose the Telegram Business connection this HubSpot inbox should receive. If the list is empty, connect the bot to the Telegram Business account first and send one test message.</p>
  <form method="post" action="/hubspot/channel-account/setup">
    ${hiddenFields}
    <label for="connectionId">Telegram Business connection</label>
    <select id="connectionId" name="connectionId" required>${options}</select>
    <label for="accountName">HubSpot inbox label</label>
    <input id="accountName" name="accountName" value="${escapeHtml(config.hubspot.businessAccountName)}" required>
    <button type="submit">Connect account</button>
  </form>
</body>
</html>`;
}

function renderMessagePage(title, message) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
    title
  )}</title></head>
<body style="font-family: system-ui, sans-serif; margin: 32px;">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;
}

async function readRawBody(request, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
