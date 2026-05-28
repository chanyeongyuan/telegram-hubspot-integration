import crypto from "node:crypto";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function verifyTelegramSecret(headers, expectedSecret) {
  if (!expectedSecret) {
    return true;
  }

  return timingSafeEqual(getHeader(headers, "x-telegram-bot-api-secret-token"), expectedSecret);
}

export function verifyHubSpotSignatureV3(headers, request, clientSecret) {
  if (!clientSecret) {
    return true;
  }

  const signature = getHeader(headers, "x-hubspot-signature-v3");
  const timestamp = getHeader(headers, "x-hubspot-request-timestamp") || request.timestamp;
  if (!signature || !timestamp) {
    return false;
  }

  const requestTimestamp = Number(timestamp);
  if (!Number.isFinite(requestTimestamp)) {
    return false;
  }

  const now = Number.isFinite(request.now) ? request.now : Date.now();
  if (Math.abs(now - requestTimestamp) > FIVE_MINUTES_MS) {
    return false;
  }

  const source = `${request.method}${normalizeHubSpotSignedUrl(request.url)}${request.rawBody || ""}${timestamp}`;
  const digest = crypto.createHmac("sha256", clientSecret).update(source, "utf8").digest("base64");
  return timingSafeEqual(digest, signature);
}

export function timingSafeEqual(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") {
    return false;
  }

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function getHeader(headers, headerName) {
  if (!headers) {
    return "";
  }

  if (typeof headers.get === "function") {
    return headers.get(headerName) || "";
  }

  const normalized = headerName.toLowerCase();
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === normalized);
  return found ? String(found[1]) : "";
}

function normalizeHubSpotSignedUrl(url) {
  return String(url)
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/")
    .replace(/%40/gi, "@")
    .replace(/%21/gi, "!")
    .replace(/%24/gi, "$")
    .replace(/%27/gi, "'")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")")
    .replace(/%2A/gi, "*")
    .replace(/%2C/gi, ",")
    .replace(/%3B/gi, ";");
}
