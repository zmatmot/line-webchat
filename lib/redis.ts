import { Redis } from "@upstash/redis";

let client: Redis | undefined;

/**
 * Resolves REST credentials from either naming scheme: the Vercel Upstash
 * integration injects `KV_REST_API_*`, a database created directly on Upstash
 * documents `UPSTASH_REDIS_REST_*`.
 */
function resolveCredentials(): { url: string; token: string } {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN " +
        "(Vercel Upstash integration) or UPSTASH_REDIS_REST_URL and " +
        "UPSTASH_REDIS_REST_TOKEN (Upstash direct).",
    );
  }
  return { url, token };
}

/**
 * Lazily creates the client so that a missing env var fails the request that
 * needs Redis, not `next build`.
 */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis({
      ...resolveCredentials(),
      // Values are read back as the exact strings we wrote. With the default
      // (JSON-parse everything) a display name like "123" would come back as
      // a number.
      automaticDeserialization: false,
    });
  }
  return client;
}
