# HubSpot Setup Worksheet

Portal: `50444105`

## 1. Project App

The HubSpot app is defined in code with HubSpot Projects:

- `hsproject.json`
- `hubspot/app/app-hsmeta.json`

It is configured as a private OAuth developer app, which is the right shape for a custom channel used by this business rather than a Marketplace listing.

Upload it with the HubSpot CLI:

```bash
npm install -g @hubspot/cli@latest
hs account auth
npm run hubspot:project:validate
npm run hubspot:project:upload
npm run hubspot:project:open
```

When the project opens in HubSpot, open the app component and go to the Auth tab.

Required app scopes:

- `conversations.custom_channels.read`
- `conversations.custom_channels.write`
- `conversations.read`
- `crm.objects.contacts.write`

Values to copy into `.env`:

- `HUBSPOT_APP_ID=`
- `HUBSPOT_CLIENT_ID=`
- `HUBSPOT_CLIENT_SECRET=`
- `HUBSPOT_DEVELOPER_API_KEY=`

## 2. App URLs

These are already set in `hubspot/app/app-hsmeta.json` for the Render service.

- OAuth redirect URL: `https://telegram-hubspot-integration.onrender.com/hubspot/oauth/callback`
- Channel setup URL: `https://telegram-hubspot-integration.onrender.com/hubspot/channel-account/setup`
- Channel webhook URL: `https://telegram-hubspot-integration.onrender.com/webhooks/hubspot`

## 3. Register Channel

After `.env` has `PUBLIC_BASE_URL`, `HUBSPOT_APP_ID`, and `HUBSPOT_DEVELOPER_API_KEY`, run:

```bash
npm run setup:hubspot-channel
```

Copy the returned channel ID into:

```text
HUBSPOT_CHANNEL_ID=
```

## 4. Install OAuth

After deployment, open:

```text
<PUBLIC_BASE_URL>/hubspot/oauth/start
```

Install into portal `50444105`.

## 5. Connect Inbox

Use HubSpot inbox/help desk channel connection flow, or direct creation with:

```bash
TELEGRAM_BUSINESS_CONNECTION_ID=bc_... HUBSPOT_INBOX_ID=123 npm run setup:hubspot-account
```
