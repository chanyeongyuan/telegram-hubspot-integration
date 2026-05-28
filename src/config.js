import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SCOPES = [
  "conversations.custom_channels.read",
  "conversations.custom_channels.write",
  "conversations.read",
  "crm.objects.contacts.write"
];

export function loadDotEnv(filePath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unquoteEnvValue(rest.join("="));
  }
}

export function loadConfig(env = process.env) {
  const publicBaseUrl = trimTrailingSlash(env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || "");
  const stateFilePath = env.STATE_FILE_PATH || path.resolve(projectRoot(), "data", "state.json");

  return {
    port: Number(env.PORT || 3000),
    publicBaseUrl,
    stateFilePath,
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || "",
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || ""
    },
    hubspot: {
      portalId: env.HUBSPOT_PORTAL_ID || "50444105",
      appId: env.HUBSPOT_APP_ID || "",
      developerApiKey: env.HUBSPOT_DEVELOPER_API_KEY || "",
      clientId: env.HUBSPOT_CLIENT_ID || "",
      clientSecret: env.HUBSPOT_CLIENT_SECRET || "",
      staticAccessToken: env.HUBSPOT_ACCESS_TOKEN || "",
      channelId: env.HUBSPOT_CHANNEL_ID || "",
      channelAccountId: env.HUBSPOT_CHANNEL_ACCOUNT_ID || "",
      inboxId: env.HUBSPOT_INBOX_ID || "",
      businessAccountName: env.TELEGRAM_BUSINESS_ACCOUNT_NAME || "Telegram Business",
      channelName: env.HUBSPOT_CHANNEL_NAME || "Telegram Business",
      channelDescription:
        env.HUBSPOT_CHANNEL_DESCRIPTION || "Route Telegram Business 1:1 enquiries into HubSpot.",
      channelLogoUrl: env.HUBSPOT_CHANNEL_LOGO_URL || "",
      oauthScopes: splitCsv(env.HUBSPOT_OAUTH_SCOPES).length > 0 ? splitCsv(env.HUBSPOT_OAUTH_SCOPES) : DEFAULT_SCOPES
    }
  };
}

export function getReadiness(config, stateStore) {
  const missing = [];

  if (!config.publicBaseUrl) missing.push("PUBLIC_BASE_URL");
  if (!config.telegram.botToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.hubspot.channelId) missing.push("HUBSPOT_CHANNEL_ID");
  if (!config.hubspot.staticAccessToken && !stateStore?.getHubSpotTokens()?.accessToken) {
    missing.push("HUBSPOT_ACCESS_TOKEN or completed HubSpot OAuth");
  }

  return {
    ok: missing.length === 0,
    missing,
    knownBusinessConnections: stateStore ? stateStore.listBusinessConnections().length : 0
  };
}

export function projectRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "..");
}

function splitCsv(value = "") {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
