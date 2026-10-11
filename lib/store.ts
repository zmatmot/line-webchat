import { getRedis } from "./redis";
import type {
  ChatMessage,
  ChatUser,
  MessageDirection,
  MessageType,
  UserProfile,
} from "./types";

const USERS_KEY = "users";
const MAX_MESSAGES = 500;
const MAX_USERS = 200;
const PREVIEW_LENGTH = 200;
const EVENT_TTL_SECONDS = 60 * 60 * 24;

export const UNKNOWN_DISPLAY_NAME = "Unknown";

const userKey = (userId: string) => `user:${userId}`;
const messagesKey = (userId: string) => `messages:${userId}`;
const eventKey = (eventId: string) => `webhook:event:${eventId}`;

const USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

/** LINE user IDs are "U" followed by 32 hex characters (33 chars total). */
export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

const DIRECTIONS: readonly MessageDirection[] = ["in", "out"];
const MESSAGE_TYPES: readonly MessageType[] = [
  "text",
  "sticker",
  "image",
  "video",
  "audio",
  "file",
  "location",
  "unknown",
];

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.text === "string" &&
    typeof record.ts === "number" &&
    DIRECTIONS.includes(record.direction as MessageDirection) &&
    MESSAGE_TYPES.includes(record.type as MessageType)
  );
}

function toInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalizes an HGETALL reply. With automatic deserialization disabled (see
 * lib/redis.ts) the SDK hands back Redis' raw flat `[field, value, ...]`
 * array instead of an object; both shapes are accepted.
 */
function toHash(raw: unknown): Record<string, string> {
  const hash: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      hash[String(raw[i])] = String(raw[i + 1]);
    }
  } else if (typeof raw === "object" && raw !== null) {
    for (const [field, value] of Object.entries(raw)) {
      hash[field] = String(value);
    }
  }
  return hash;
}

function parseUser(userId: string, raw: unknown): ChatUser | null {
  const hash = toHash(raw);
  if (Object.keys(hash).length === 0) return null;
  return {
    userId,
    displayName: hash.displayName || UNKNOWN_DISPLAY_NAME,
    pictureUrl: hash.pictureUrl ?? "",
    lastMessage: hash.lastMessage ?? "",
    lastAt: toInt(hash.lastAt),
    unread: Math.max(0, toInt(hash.unread)),
  };
}

/**
 * Claims a webhook event for processing. Returns false when the event was
 * already claimed, i.e. LINE redelivered it.
 */
export async function claimWebhookEvent(eventId: string): Promise<boolean> {
  const result = await getRedis().set(eventKey(eventId), "1", {
    nx: true,
    ex: EVENT_TTL_SECONDS,
  });
  return result === "OK";
}

/** Releases a claim so a redelivery of a failed event is processed again. */
export async function releaseWebhookEvent(eventId: string): Promise<void> {
  await getRedis().del(eventKey(eventId));
}

export async function getUser(userId: string): Promise<ChatUser | null> {
  const raw: unknown = await getRedis().hgetall(userKey(userId));
  return parseUser(userId, raw);
}

/** True when a real profile (not the "Unknown" fallback) is stored. */
export async function hasProfile(userId: string): Promise<boolean> {
  const displayName = await getRedis().hget<string>(
    userKey(userId),
    "displayName",
  );
  return Boolean(displayName) && displayName !== UNKNOWN_DISPLAY_NAME;
}

export async function saveProfile(
  userId: string,
  profile: UserProfile,
): Promise<void> {
  await getRedis().hset(userKey(userId), {
    userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  });
}

/** Lists a user without a message, e.g. right after they add the OA. */
export async function touchUser(userId: string, ts: number): Promise<void> {
  const tx = getRedis().multi();
  tx.hset(userKey(userId), { userId, lastAt: String(ts) });
  tx.zadd(USERS_KEY, { score: ts, member: userId });
  await tx.exec();
}

/**
 * Appends a message and updates the conversation summary in one transaction.
 * Incoming messages also bump the unread counter.
 */
export async function appendMessage(
  userId: string,
  message: ChatMessage,
): Promise<void> {
  const tx = getRedis().multi();
  tx.hset(userKey(userId), {
    userId,
    lastMessage: message.text.slice(0, PREVIEW_LENGTH),
    lastAt: String(message.ts),
  });
  if (message.direction === "in") {
    tx.hincrby(userKey(userId), "unread", 1);
  }
  tx.zadd(USERS_KEY, { score: message.ts, member: userId });
  tx.rpush(messagesKey(userId), JSON.stringify(message));
  tx.ltrim(messagesKey(userId), -MAX_MESSAGES, -1);
  await tx.exec();
}

/** Users ordered by most recent activity first. */
export async function listUsers(): Promise<ChatUser[]> {
  const redis = getRedis();
  const userIds = await redis.zrange<string[]>(USERS_KEY, 0, MAX_USERS - 1, {
    rev: true,
  });
  if (userIds.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const userId of userIds) {
    pipeline.hgetall(userKey(userId));
  }
  const hashes = await pipeline.exec<unknown[]>();

  return userIds
    .map((userId, index) => parseUser(userId, hashes[index]))
    .filter((user): user is ChatUser => user !== null);
}

/** Messages of one conversation, oldest first. */
export async function listMessages(userId: string): Promise<ChatMessage[]> {
  const raw = await getRedis().lrange<string>(messagesKey(userId), 0, -1);
  const messages: ChatMessage[] = [];
  for (const entry of raw) {
    try {
      const parsed: unknown = JSON.parse(entry);
      if (isChatMessage(parsed)) messages.push(parsed);
    } catch {
      // Skip an unreadable entry rather than failing the whole conversation.
    }
  }
  return messages;
}

export async function markRead(userId: string): Promise<void> {
  await getRedis().hset(userKey(userId), { unread: "0" });
}
