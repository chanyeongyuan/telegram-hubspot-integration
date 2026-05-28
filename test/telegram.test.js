import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCustomerDeliveryIdentifier,
  buildBusinessDeliveryIdentifier,
  parseCustomerDeliveryIdentifier,
  normalizeBusinessMessageUpdate
} from "../src/telegram.js";

describe("Telegram Business message normalization", () => {
  it("normalizes an inbound private Telegram business message from a customer", () => {
    const result = normalizeBusinessMessageUpdate(
      {
        business_message: {
          business_connection_id: "bc_123",
          message_id: 77,
          date: 1710000000,
          chat: { id: 987654321, type: "private", first_name: "Ada", username: "ada_lovelace" },
          from: { id: 987654321, is_bot: false, first_name: "Ada", username: "ada_lovelace" },
          text: "Hi, I need pricing help"
        }
      },
      { businessAccountUserId: 1111 }
    );

    assert.deepEqual(result, {
      connectionId: "bc_123",
      chatId: "987654321",
      messageId: "77",
      timestamp: "2024-03-09T16:00:00.000Z",
      text: "Hi, I need pricing help",
      senderName: "Ada (@ada_lovelace)",
      attachmentTypes: [],
      senderDeliveryIdentifier: buildCustomerDeliveryIdentifier("bc_123", "987654321"),
      recipientDeliveryIdentifier: buildBusinessDeliveryIdentifier("bc_123")
    });
  });

  it("ignores messages sent by the connected business account", () => {
    const result = normalizeBusinessMessageUpdate(
      {
        business_message: {
          business_connection_id: "bc_123",
          message_id: 78,
          date: 1710000000,
          chat: { id: 987654321, type: "private" },
          from: { id: 1111, is_bot: false, first_name: "Business Owner" },
          text: "We already replied in Telegram"
        }
      },
      { businessAccountUserId: 1111 }
    );

    assert.equal(result, null);
  });

  it("ignores non-private chats for the 1:1 enquiries MVP", () => {
    const result = normalizeBusinessMessageUpdate({
      business_message: {
        business_connection_id: "bc_123",
        message_id: 79,
        date: 1710000000,
        chat: { id: -100123, type: "supergroup", title: "Group" },
        from: { id: 2222, is_bot: false, first_name: "Ada" },
        text: "Group message"
      }
    });

    assert.equal(result, null);
  });

  it("encodes and parses customer delivery identifiers for HubSpot replies", () => {
    const deliveryIdentifier = buildCustomerDeliveryIdentifier("bc_123", "987654321");

    assert.equal(deliveryIdentifier, "tg-chat:bc_123:987654321");
    assert.deepEqual(parseCustomerDeliveryIdentifier(deliveryIdentifier), {
      connectionId: "bc_123",
      chatId: "987654321"
    });
  });
});
