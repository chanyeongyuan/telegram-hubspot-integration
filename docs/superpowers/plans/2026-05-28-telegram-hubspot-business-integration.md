# Telegram HubSpot Business Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small service that routes Telegram Business 1:1 enquiries into HubSpot custom channels and sends HubSpot agent replies back through the Telegram Business account.

**Architecture:** A standalone Node.js service exposes Telegram and HubSpot webhook endpoints, translates Telegram Business updates into HubSpot custom-channel messages, and translates HubSpot outgoing-message events back to Telegram `sendMessage` calls. The service stores minimal connection/account/event state in a local JSON file and relies on HubSpot opaque delivery identifiers to route replies without exposing Telegram details in HubSpot UI.

**Tech Stack:** Node.js 20 built-ins (`http`, `fetch`, `crypto`, `node:test`), Telegram Bot API Business updates, HubSpot Conversations custom channels v3.

---

### Task 1: Message Translation Core

**Files:**
- Create: `telegram-hubspot-integration/src/telegram.js`
- Create: `telegram-hubspot-integration/src/hubspot.js`
- Test: `telegram-hubspot-integration/test/telegram.test.js`
- Test: `telegram-hubspot-integration/test/hubspot.test.js`

- [ ] Write tests for Telegram Business private-message normalization, business-account self-message filtering, non-private chat filtering, opaque identifier encoding, HubSpot incoming payload generation, unsupported media placeholders, outgoing webhook extraction, and channel registration payloads.
- [ ] Run `npm test` from `telegram-hubspot-integration` and verify imports fail because source modules do not exist yet.
- [ ] Implement source modules with pure functions only.
- [ ] Run `npm test` and verify these translation tests pass.

### Task 2: Webhook Security and State

**Files:**
- Create: `telegram-hubspot-integration/src/security.js`
- Create: `telegram-hubspot-integration/src/state.js`
- Test: `telegram-hubspot-integration/test/security.test.js`

- [ ] Write tests for Telegram webhook secret validation and HubSpot v3 signature verification.
- [ ] Run `npm test` and verify security tests fail because helpers do not exist yet.
- [ ] Implement constant-time token comparisons and HubSpot HMAC signature validation with timestamp tolerance.
- [ ] Implement JSON state persistence for business connections, channel accounts, and processed HubSpot event IDs.
- [ ] Run `npm test` and verify all tests pass.

### Task 3: Service and Setup Scripts

**Files:**
- Create: `telegram-hubspot-integration/src/config.js`
- Create: `telegram-hubspot-integration/src/server.js`
- Create: `telegram-hubspot-integration/scripts/register-hubspot-channel.js`
- Create: `telegram-hubspot-integration/scripts/create-channel-account.js`
- Create: `telegram-hubspot-integration/scripts/set-telegram-webhook.js`
- Create: `telegram-hubspot-integration/.env.example`
- Create: `telegram-hubspot-integration/README.md`

- [ ] Implement configuration loading and health/readiness checks.
- [ ] Implement `/webhooks/telegram` for `business_connection`, `business_message`, edited-message, and deleted-message update types.
- [ ] Implement `/webhooks/hubspot` for `OUTGOING_CHANNEL_MESSAGE_CREATED` and channel-account lifecycle events.
- [ ] Implement setup scripts for registering a HubSpot custom channel, creating a HubSpot channel account, and setting the Telegram webhook.
- [ ] Document Telegram Business setup, HubSpot app setup, environment variables, and deployment sequence.
- [ ] Run `npm test`, `npm run check`, and a local health endpoint smoke test.
