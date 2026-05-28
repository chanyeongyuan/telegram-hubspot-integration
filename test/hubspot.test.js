import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildIncomingMessagePayload,
  buildRegisterChannelPayload,
  extractOutgoingTelegramMessage
} from "../src/hubspot.js";
import { buildBusinessDeliveryIdentifier, buildCustomerDeliveryIdentifier } from "../src/telegram.js";

describe("HubSpot custom channel payloads", () => {
  it("builds an incoming HubSpot custom-channel payload from a Telegram message", () => {
    const payload = buildIncomingMessagePayload(
      {
        connectionId: "bc_123",
        chatId: "987654321",
        messageId: "77",
        timestamp: "2024-03-09T16:00:00.000Z",
        text: "Hi, I need pricing help",
        senderName: "Ada (@ada_lovelace)",
        attachmentTypes: [],
        senderDeliveryIdentifier: buildCustomerDeliveryIdentifier("bc_123", "987654321"),
        recipientDeliveryIdentifier: buildBusinessDeliveryIdentifier("bc_123")
      },
      {
        channelAccountId: "hs_account_456",
        businessAccountName: "Acme Telegram",
        threadingModel: "DELIVERY_IDENTIFIER"
      }
    );

    assert.deepEqual(payload, {
      attachments: [],
      channelAccountId: "hs_account_456",
      messageDirection: "INCOMING",
      recipients: [
        {
          deliveryIdentifier: {
            type: "CHANNEL_SPECIFIC_OPAQUE_ID",
            value: "tg-business:bc_123"
          },
          name: "Acme Telegram"
        }
      ],
      senders: [
        {
          deliveryIdentifier: {
            type: "CHANNEL_SPECIFIC_OPAQUE_ID",
            value: "tg-chat:bc_123:987654321"
          },
          name: "Ada (@ada_lovelace)"
        }
      ],
      text: "Hi, I need pricing help",
      timestamp: "2024-03-09T16:00:00.000Z",
      integrationIdempotencyId: "telegram:bc_123:987654321:77",
      integrationThreadId: null
    });
  });

  it("uses an unsupported-content attachment when Telegram sends non-text media", () => {
    const payload = buildIncomingMessagePayload(
      {
        connectionId: "bc_123",
        chatId: "987654321",
        messageId: "88",
        timestamp: "2024-03-09T16:00:00.000Z",
        text: "",
        senderName: "Ada",
        attachmentTypes: ["photo"],
        senderDeliveryIdentifier: buildCustomerDeliveryIdentifier("bc_123", "987654321"),
        recipientDeliveryIdentifier: buildBusinessDeliveryIdentifier("bc_123")
      },
      {
        channelAccountId: "hs_account_456",
        businessAccountName: "Acme Telegram",
        threadingModel: "DELIVERY_IDENTIFIER"
      }
    );

    assert.equal(payload.text, "[Telegram attachment: photo]");
    assert.deepEqual(payload.attachments, [{ type: "UNSUPPORTED_CONTENT" }]);
  });

  it("extracts a Telegram destination and text from a HubSpot outgoing webhook", () => {
    const result = extractOutgoingTelegramMessage({
      type: "OUTGOING_CHANNEL_MESSAGE_CREATED",
      eventId: "evt_1",
      message: {
        id: "msg_1",
        text: "Thanks, happy to help",
        recipients: [
          {
            deliveryIdentifier: {
              type: "CHANNEL_SPECIFIC_OPAQUE_ID",
              value: "tg-chat:bc_123:987654321"
            },
            name: "Ada"
          }
        ]
      }
    });

    assert.deepEqual(result, {
      eventId: "evt_1",
      hubSpotMessageId: "msg_1",
      connectionId: "bc_123",
      chatId: "987654321",
      text: "Thanks, happy to help"
    });
  });

  it("builds the HubSpot custom channel registration payload", () => {
    const payload = buildRegisterChannelPayload({
      publicBaseUrl: "https://example.com",
      channelName: "Telegram Business",
      channelDescription: "1:1 Telegram Business enquiries in HubSpot",
      logoUrl: "https://example.com/logo.png"
    });

    assert.equal(payload.name, "Telegram Business");
    assert.equal(payload.webhookUrl, "https://example.com/webhooks/hubspot");
    assert.equal(payload.channelAccountConnectionRedirectUrl, "https://example.com/hubspot/channel-account/setup");
    assert.equal(payload.capabilities.threadingModel, "DELIVERY_IDENTIFIER");
    assert.deepEqual(payload.capabilities.deliveryIdentifierTypes, ["CHANNEL_SPECIFIC_OPAQUE_ID"]);
  });
});
