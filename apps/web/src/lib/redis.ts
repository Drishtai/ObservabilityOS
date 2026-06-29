import Redis from "ioredis";

interface RedisCache {
  client: Redis | null;
}

let cached: RedisCache = (globalThis as unknown as { redisCache: RedisCache })
  .redisCache;

if (!cached) {
  cached = (globalThis as unknown as { redisCache: RedisCache }).redisCache = {
    client: null,
  };
}

// In-Memory cache fallback implementation
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

function getMemoryCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setMemoryCache(key: string, value: unknown, ttlSeconds = 300): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function delMemoryCache(key: string): void {
  memoryCache.delete(key);
}

// Redis health tracking flag
let isRedisHealthy = false;

export function getRedisClient(): Redis | null {
  const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  if (cached.client) {
    return cached.client;
  }

  try {
    let client: Redis;
    try {
      const parsed = new URL(REDIS_URL);
      const options = {
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 6379,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        db:
          parsed.pathname && parsed.pathname !== "/"
            ? parseInt(parsed.pathname.substring(1), 10)
            : 0,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      };
      client = new Redis(options);
    } catch {
      client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      });
    }

    client.on("connect", () => {
      isRedisHealthy = true;
      console.log("[Redis] Client connected successfully.");
    });

    client.on("ready", () => {
      isRedisHealthy = true;
      console.log("[Redis] Client ready.");
    });

    client.on("error", (err) => {
      isRedisHealthy = false;
      console.warn("[Redis] client connection error:", err.message);
    });

    client.on("close", () => {
      isRedisHealthy = false;
      console.warn("[Redis] client connection closed.");
    });

    client.on("end", () => {
      isRedisHealthy = false;
      console.warn("[Redis] client connection ended.");
    });

    // Manually trigger a quick connection test
    client.connect().catch((err) => {
      isRedisHealthy = false;
      console.warn("[Redis] lazyConnect trigger failed:", err.message);
    });

    cached.client = client;
    return client;
  } catch (e) {
    console.error("Failed to initialize Redis client:", e);
    isRedisHealthy = false;
    return null;
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  // Always query memory cache first to see if we have a fast local hit, or fallback immediately if Redis is down
  // Bypass memory cache for dashboard views to prevent multi-process sync issues
  if (!key.startsWith("dashboard:")) {
    const memoryHit = getMemoryCache<T>(key);
    if (memoryHit !== null) {
      return memoryHit;
    }
  }

  if (!isRedisHealthy) {
    return null;
  }

  const client = getRedisClient();
  if (!client) return null;
  try {
    const data = await client.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      // Backfill memory cache
      setMemoryCache(key, parsed, 30);
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn(`Redis getCache failed for key ${key}:`, err);
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  // Always write to memory cache as secondary/backup layer
  setMemoryCache(key, value, ttlSeconds);

  if (!isRedisHealthy) {
    return;
  }

  const client = getRedisClient();
  if (!client) return;
  try {
    const serialized = JSON.stringify(value);
    await client.set(key, serialized, "EX", ttlSeconds);
  } catch (err) {
    console.warn(`Redis setCache failed for key ${key}:`, err);
  }
}

export async function delCache(key: string): Promise<void> {
  delMemoryCache(key);

  if (!isRedisHealthy) {
    return;
  }

  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    console.warn(`Redis delCache failed for key ${key}:`, err);
  }
}

export function createNewRedisClient(): Redis | null {
  const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  try {
    let client: Redis;
    try {
      const parsed = new URL(REDIS_URL);
      const options = {
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 6379,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        db:
          parsed.pathname && parsed.pathname !== "/"
            ? parseInt(parsed.pathname.substring(1), 10)
            : 0,
        maxRetriesPerRequest: null,
        connectTimeout: 2000,
      };
      client = new Redis(options);
    } catch {
      client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        connectTimeout: 2000,
      });
    }
    client.on("error", (err) => {
      console.warn("New Redis client connection error:", err.message);
    });
    return client;
  } catch (e) {
    console.error("Failed to create new Redis client:", e);
    return null;
  }
}

export async function checkRedisHealth(): Promise<{
  status: "healthy" | "unhealthy";
  details?: {
    isHealthy: boolean;
    status: string;
  };
}> {
  const client = getRedisClient();
  if (!client) {
    return {
      status: "unhealthy",
      details: {
        isHealthy: false,
        status: "not_initialized",
      },
    };
  }
  return {
    status: isRedisHealthy ? "healthy" : "unhealthy",
    details: {
      isHealthy: isRedisHealthy,
      status: client.status,
    },
  };
}
