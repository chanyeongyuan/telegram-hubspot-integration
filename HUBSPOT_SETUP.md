# HubSpot Setup Worksheet

Portal: `50444105`

## 1. Public App

Create or open a HubSpot public/developer app.

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

These depend on `PUBLIC_BASE_URL`.

- OAuth redirect URL: `<PUBLIC_BASE_URL>/hubspot/oauth/callback`
- Channel setup URL: `<PUBLIC_BASE_URL>/hubspot/channel-account/setup`
- Channel webhook URL: `<PUBLIC_BASE_URL>/webhooks/hubspot`

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
