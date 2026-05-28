# Telegram Business to HubSpot Custom Channel

This service routes Telegram Business 1:1 enquiries into HubSpot Conversations via HubSpot custom channels, then sends HubSpot agent replies back through the connected Telegram Business account.

## What It Builds

- `POST /webhooks/telegram`: receives Telegram Bot API Business updates.
- `POST /webhooks/hubspot`: receives HubSpot custom-channel outgoing message events.
- `GET /hubspot/oauth/start`: starts HubSpot OAuth for the portal.
- `GET|POST /hubspot/channel-account/setup`: HubSpot custom-channel account connection popup.
- Setup scripts for registering the HubSpot custom channel, creating a channel account, and setting the Telegram webhook.

The recommended first release is intentionally narrow: configure the Telegram Business connected bot to receive new non-contact/private chats only, and this service ignores non-private chats.

## Telegram Setup

1. Create a bot in BotFather and copy `TELEGRAM_BOT_TOKEN`.
2. Enable/configure the bot for Telegram Business usage in BotFather.
3. In the human/business Telegram account, connect the bot as a business bot.
4. Grant access only to the enquiry segment you want in HubSpot, recommended: new chats/non-contacts.
5. Deploy this service to a public HTTPS URL and run:

```bash
npm run setup:telegram-webhook
```

Telegram will send `business_connection`, `business_message`, `edited_business_message`, and `deleted_business_messages` updates to the service.

## HubSpot Setup

HubSpot custom channels require a HubSpot public/developer app. Private apps are not enough for custom-channel registration.

This repo includes a HubSpot Projects app definition:

- `hsproject.json`
- `hubspot/app/app-hsmeta.json`

The app is configured as a private OAuth developer app using the Render callback URL:

```text
https://telegram-hubspot-integration.onrender.com/hubspot/oauth/callback
```

Required scopes:

- `conversations.custom_channels.read`
- `conversations.custom_channels.write`
- `conversations.read`
- `crm.objects.contacts.write`

Then:

1. Install and authenticate the HubSpot CLI, then upload the project:

```bash
npm install -g @hubspot/cli@latest
hs account auth
npm run hubspot:project:validate
npm run hubspot:project:upload
npm run hubspot:project:open
```

2. Open the uploaded app's Auth tab in HubSpot and copy its App ID, Client ID, and Client secret.
3. Copy `.env.example` to `.env` and fill in the HubSpot app and Telegram values.
   On Render, `PUBLIC_BASE_URL` can be left blank because the service uses Render's `RENDER_EXTERNAL_URL`.
4. Register or update the custom channel:

```bash
npm run setup:hubspot-channel
```

5. Set `HUBSPOT_CHANNEL_ID` from the response.
6. Install/connect OAuth for portal `50444105` by opening:

```text
https://your-service.example.com/hubspot/oauth/start
```

7. Connect the channel account either through the HubSpot inbox/help desk setup flow, or directly:

```bash
TELEGRAM_BUSINESS_CONNECTION_ID=bc_... HUBSPOT_INBOX_ID=123 npm run setup:hubspot-account
```

If you use HubSpot's setup popup, first connect the Telegram Business bot and send a test message so the service has seen the `business_connection` ID.

## Local Development

```bash
npm test
npm run check
npm start
```

Health checks:

- `GET /api/health`
- `GET /api/readiness`

## Routing Model

The HubSpot custom channel uses `DELIVERY_IDENTIFIER` threading and `CHANNEL_SPECIFIC_OPAQUE_ID` delivery identifiers.

- Business account: `tg-business:<business_connection_id>`
- Customer chat: `tg-chat:<business_connection_id>:<telegram_chat_id>`

This lets HubSpot replies carry enough routing information for Telegram without requiring a database lookup for every outbound reply.

## Notes and Limits

- Text messages are fully bridged.
- Telegram media is represented in HubSpot as unsupported content in this MVP. File upload mirroring can be added later through Telegram `getFile` plus HubSpot Files API.
- Edited/deleted Telegram messages are acknowledged but not mirrored into HubSpot yet.
- Use durable storage for `STATE_FILE_PATH`; it stores OAuth tokens, Telegram business connection metadata, channel-account mappings, and processed HubSpot event IDs.
