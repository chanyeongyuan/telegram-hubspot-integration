import { loadConfig, loadDotEnv } from "../src/config.js";
import { buildChannelAccountPayload, HubSpotClient, HubSpotOAuthTokenProvider } from "../src/hubspot.js";
import { StateStore } from "../src/state.js";

loadDotEnv();

const config = loadConfig();
const stateStore = new StateStore(config.stateFilePath);
const connectionId = process.env.TELEGRAM_BUSINESS_CONNECTION_ID;

if (!config.hubspot.channelId || !config.hubspot.inboxId || !connectionId) {
  throw new Error("HUBSPOT_CHANNEL_ID, HUBSPOT_INBOX_ID, and TELEGRAM_BUSINESS_CONNECTION_ID are required");
}

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

const account = await hubSpotClient.createChannelAccount(
  config.hubspot.channelId,
  buildChannelAccountPayload({
    inboxId: config.hubspot.inboxId,
    accountName: config.hubspot.businessAccountName,
    connectionId
  })
);

console.log(JSON.stringify(account, null, 2));
