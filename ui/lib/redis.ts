import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Lazily-built singleton Upstash Redis client.
 *
 * `Redis.fromEnv()` reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 * Built on first use and cached on `globalThis` so dev hot-reload doesn't create
 * a new client per recompile. Throws a clear error when unconfigured.
 */
let cached: Redis | undefined =
  (globalThis as { __redisClient?: Redis }).__redisClient;

export function getRedisClient(): Redis {
  if (cached) return cached;

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      "Upstash Redis is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in ui/.env.local",
    );
  }

  cached = Redis.fromEnv();
  (globalThis as { __redisClient?: Redis }).__redisClient = cached;
  return cached;
}

/** Redis key under which a record's annotation is stored. */
export function annotationKey(recordId: string): string {
  return `annotation:${recordId}`;
}
