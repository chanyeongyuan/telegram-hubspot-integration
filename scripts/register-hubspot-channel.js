import { loadConfig, loadDotEnv } from "../src/config.js";
import { buildRegisterChannelPayload } from "../src/hubspot.js";

loadDotEnv();

const config = loadConfig();

if (!config.hubspot.developerApiKey || !config.hubspot.appId || !config.publicBaseUrl) {
  throw new Error("HUBSPOT_DEVELOPER_API_KEY, HUBSPOT_APP_ID, and PUBLIC_BASE_URL are required");
}

const channelId = config.hubspot.channelId;
const url = new URL(
  channelId
    ? `https://api.hubapi.com/conversations/v3/custom-channels/${channelId}`
    : "https://api.hubapi.com/conversations/v3/custom-channels"
);
url.searchParams.set("hapikey", config.hubspot.developerApiKey);
url.searchParams.set("appId", config.hubspot.appId);

const payload = buildRegisterChannelPayload({
  publicBaseUrl: config.publicBaseUrl,
  channelName: config.hubspot.channelName,
  channelDescription: config.hubspot.channelDescription,
  logoUrl: config.hubspot.channelLogoUrl
});

const response = await fetch(url, {
  method: channelId ? "PATCH" : "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload)
});
const data = await response.json().catch(() => ({}));

if (!response.ok) {
  throw new Error(`HubSpot channel registration failed: ${data.message || response.statusText}`);
}

console.log(JSON.stringify(data, null, 2));
