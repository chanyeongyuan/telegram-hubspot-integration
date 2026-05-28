import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyHubSpotSignatureV3, verifyTelegramSecret } from "../src/security.js";

describe("webhook security helpers", () => {
  it("verifies Telegram webhook secret tokens", () => {
    assert.equal(verifyTelegramSecret({ "x-telegram-bot-api-secret-token": "abc" }, "abc"), true);
    assert.equal(verifyTelegramSecret({ "x-telegram-bot-api-secret-token": "abc" }, "wrong"), false);
    assert.equal(verifyTelegramSecret({}, ""), true);
  });

  it("verifies HubSpot v3 signatures", () => {
    const request = {
      method: "POST",
      url: "https://example.com/webhooks/hubspot",
      rawBody: "{\"ok\":true}",
      timestamp: "1710000000000",
      now: 1710000100000
    };

    const signature = "ePGe0OubMtzFYMUSs5FNqEGXIvP+c9u2aU8bUyHT8Nk=";

    assert.equal(
      verifyHubSpotSignatureV3(
        {
          "x-hubspot-signature-v3": signature,
          "x-hubspot-request-timestamp": request.timestamp
        },
        request,
        "client-secret"
      ),
      true
    );
  });
});
