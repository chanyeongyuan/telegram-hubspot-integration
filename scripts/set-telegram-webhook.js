import { loadConfig, loadDotEnv } from "../src/config.js";
import { TelegramClient } from "../src/telegram.js";

loadDotEnv();

const config = loadConfig();

if (!config.telegram.botToken || !config.publicBaseUrl) {
  throw new Error("TELEGRAM_BOT_TOKEN and PUBLIC_BASE_URL are required");
}

const telegramClient = new TelegramClient({ botToken: config.telegram.botToken });
const result = await telegramClient.setWebhook({
  webhookUrl: `${config.publicBaseUrl}/webhooks/telegram`,
  secretToken: config.telegram.webhookSecret,
  dropPendingUpdates: process.env.TELEGRAM_DROP_PENDING_UPDATES === "true"
});

console.log(JSON.stringify(result, null, 2));
const info = await telegramClient.getWebhookInfo();
console.log(JSON.stringify(info, null, 2));
