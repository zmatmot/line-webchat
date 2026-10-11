import {
  HTTPFetchError,
  messagingApi,
  validateSignature,
  webhook,
} from "@line/bot-sdk";
import { UNKNOWN_DISPLAY_NAME } from "./store";
import type { MessageType, UserProfile } from "./types";

export const MAX_TEXT_LENGTH = 5000;

let client: messagingApi.MessagingApiClient | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

function getClient(): messagingApi.MessagingApiClient {
  if (!client) {
    client = new messagingApi.MessagingApiClient({
      channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    });
  }
  return client;
}

/** Checks `x-line-signature` against the raw, unparsed request body. */
export function verifySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  try {
    return validateSignature(
      rawBody,
      requireEnv("LINE_CHANNEL_SECRET"),
      signature,
    );
  } catch (error) {
    console.error("Signature verification failed", error);
    return false;
  }
}

/**
 * Fetches a user's profile. Never throws: a user who blocked the OA, or a
 * transient LINE error, must not stop the message from being stored.
 */
export async function fetchProfile(userId: string): Promise<UserProfile> {
  try {
    const profile = await getClient().getProfile(userId);
    return {
      displayName: profile.displayName || UNKNOWN_DISPLAY_NAME,
      pictureUrl: profile.pictureUrl ?? "",
    };
  } catch (error) {
    console.warn(`getProfile failed for ${userId}`, error);
    return { displayName: UNKNOWN_DISPLAY_NAME, pictureUrl: "" };
  }
}

/** An error from the LINE API, carrying the status our own API should return. */
export class LineApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LineApiError";
  }
}

function describeLineErrorBody(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { message, details } = parsed as Record<string, unknown>;
    if (typeof message !== "string") return null;

    const detailMessages = Array.isArray(details)
      ? details
          .map((detail: unknown) =>
            typeof detail === "object" && detail !== null
              ? (detail as Record<string, unknown>).message
              : undefined,
          )
          .filter((value): value is string => typeof value === "string")
      : [];
    return detailMessages.length > 0
      ? `${message} (${detailMessages.join("; ")})`
      : message;
  } catch {
    return null;
  }
}

function toLineApiError(error: unknown): LineApiError {
  if (!(error instanceof HTTPFetchError)) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return new LineApiError(`Could not reach the LINE API: ${reason}`, 502);
  }

  const detail = describeLineErrorBody(error.body) ?? error.statusText;
  switch (error.status) {
    case 400:
      return new LineApiError(`LINE rejected the message: ${detail}`, 400);
    case 401:
    case 403:
      // Our channel access token is wrong, not the caller's request.
      return new LineApiError(`LINE authorization failed: ${detail}`, 502);
    case 429:
      return new LineApiError(
        `LINE rate limit or monthly message quota reached: ${detail}`,
        429,
      );
    default:
      return new LineApiError(`LINE API error ${error.status}: ${detail}`, 502);
  }
}

/**
 * Sends a text push message. `retryKey` makes the request idempotent on
 * LINE's side, so a retried request cannot deliver the message twice.
 */
export async function pushText(
  userId: string,
  text: string,
  retryKey: string,
): Promise<void> {
  try {
    await getClient().pushMessage(
      { to: userId, messages: [{ type: "text", text }] },
      retryKey,
    );
  } catch (error) {
    throw toLineApiError(error);
  }
}

/** Maps a webhook message to what the console stores and displays. */
export function describeMessage(content: webhook.MessageContent): {
  type: MessageType;
  text: string;
} {
  switch (content.type) {
    case "text":
      return { type: "text", text: content.text };
    case "sticker":
      return { type: "sticker", text: "[sticker]" };
    case "image":
      return { type: "image", text: "[image]" };
    case "video":
      return { type: "video", text: "[video]" };
    case "audio":
      return { type: "audio", text: "[audio]" };
    case "file":
      return { type: "file", text: `[file] ${content.fileName}`.trim() };
    case "location": {
      const place = content.title ?? content.address ?? "";
      return { type: "location", text: `[location] ${place}`.trim() };
    }
    default:
      return { type: "unknown", text: "[unsupported message]" };
  }
}
