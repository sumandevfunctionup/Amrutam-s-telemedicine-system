import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis = null;
let isRedisAvailable = false;

if (url && token) {
  try {
    redis = new Redis({
      url,
      token,
    });
    isRedisAvailable = true;
  } catch (err) {
    console.warn('[Redis] Failed to initialize Redis client. Falling back to DB-only mode:', err.message);
  }
} else {
  console.warn('[Redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing. Redis disabled.');
}

export const redisClient = redis;
export const getRedisClient = () => redis;

/**
 * Diagnostics ping
 */
export async function pingRedis() {
  if (!redis) return { status: 'disabled', latency_ms: null };
  const start = Date.now();
  try {
    const res = await redis.ping();
    const latency_ms = Date.now() - start;
    return {
      status: res === 'PONG' ? 'healthy' : 'degraded',
      latency_ms,
      mode: 'upstash-rest',
    };
  } catch (err) {
    return {
      status: 'error',
      latency_ms: Date.now() - start,
      error: err.message,
    };
  }
}

/**
 * Safe Get from cache
 * Returns null on miss or error
 */
export async function cacheGet(key) {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  } catch (err) {
    console.warn(`[Redis] cacheGet error for key "${key}":`, err.message);
    return null;
  }
}

/**
 * Safe Set into cache with TTL in seconds
 */
export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!redis) return false;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(key, serialized, { ex: ttlSeconds });
    } else {
      await redis.set(key, serialized);
    }
    return true;
  } catch (err) {
    console.warn(`[Redis] cacheSet error for key "${key}":`, err.message);
    return false;
  }
}

/**
 * Delete one or more keys, or a wildcard prefix pattern
 */
export async function cacheDel(keyOrPattern) {
  if (!redis) return false;
  try {
    if (keyOrPattern.includes('*')) {
      const keys = await redis.keys(keyOrPattern);
      if (keys && keys.length > 0) {
        await Promise.all(keys.map((k) => redis.del(k)));
      }
      return true;
    }
    await redis.del(keyOrPattern);
    return true;
  } catch (err) {
    console.warn(`[Redis] cacheDel error for "${keyOrPattern}":`, err.message);
    return false;
  }
}

/**
 * Acquire distributed lock using Redis SET NX EX
 * Returns lock token if acquired, false if locked by another process
 */
export async function acquireDistributedLock(resourceKey, lockToken, ttlSeconds = 600) {
  if (!redis) return true; // Fallback to DB row lock if Redis is down
  try {
    const lockKey = `amrutam:lock:${resourceKey}`;
    // SET NX EX: returns "OK" if key was set, null if key already existed
    const result = await redis.set(lockKey, lockToken, { nx: true, ex: ttlSeconds });
    return result === 'OK' || result === true;
  } catch (err) {
    console.warn(`[Redis] acquireDistributedLock error for "${resourceKey}":`, err.message);
    return true; // Graceful degradation to DB row-lock
  }
}

/**
 * Release distributed lock only if lockToken matches owner
 */
export async function releaseDistributedLock(resourceKey, lockToken) {
  if (!redis) return true;
  try {
    const lockKey = `amrutam:lock:${resourceKey}`;
    const currentToken = await redis.get(lockKey);
    if (currentToken === lockToken) {
      await redis.del(lockKey);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[Redis] releaseDistributedLock error for "${resourceKey}":`, err.message);
    return false;
  }
}

/**
 * Revoke JWT token by placing its signature in Redis blacklist with TTL
 */
export async function revokeJwt(token, expiresInSeconds = 900) {
  if (!redis) return true;
  try {
    const key = `amrutam:revoked_token:${token}`;
    await redis.set(key, 'revoked', { ex: Math.max(expiresInSeconds, 60) });
    return true;
  } catch (err) {
    console.warn('[Redis] revokeJwt error:', err.message);
    return false;
  }
}

/**
 * Check if JWT token is blacklisted
 */
export async function isJwtRevoked(token) {
  if (!redis) return false;
  try {
    const key = `amrutam:revoked_token:${token}`;
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (err) {
    console.warn('[Redis] isJwtRevoked error:', err.message);
    return false; // Fail open to DB validation
  }
}

/**
 * Check and increment rate limit for a key (IP or User ID)
 * Returns { allowed: boolean, current: number, remaining: number, ttl: number }
 */
export async function checkRateLimit(identifier, maxRequests = 60, windowSeconds = 60) {
  if (!redis) return { allowed: true, current: 1, remaining: maxRequests - 1, ttl: windowSeconds };
  try {
    const key = `amrutam:ratelimit:${identifier}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);
    const allowed = current <= maxRequests;
    return {
      allowed,
      current,
      remaining: Math.max(0, maxRequests - current),
      ttl: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (err) {
    console.warn('[Redis] checkRateLimit error:', err.message);
    return { allowed: true, current: 1, remaining: maxRequests - 1, ttl: windowSeconds };
  }
}
