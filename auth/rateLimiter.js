import { checkRateLimit } from '../helper/redis.js';
import { tooManyRequests } from '../helper/apiResponse.js';

/**
 * Middleware factory for Redis-backed rate limiting
 * @param {Object} options - { max: number, windowSeconds: number, keyPrefix: string }
 */
export function rateLimiter({ max = 60, windowSeconds = 60, keyPrefix = 'rl' } = {}) {
  return async (req, res, next) => {
    try {
      const clientIp =
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const identifier = `${keyPrefix}:${clientIp}`;

      const { allowed, current, remaining, ttl } = await checkRateLimit(
        identifier,
        max,
        windowSeconds
      );

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', ttl);

      if (!allowed) {
        return tooManyRequests(
          res,
          `Rate limit exceeded. Maximum ${max} requests per ${windowSeconds}s. Try again in ${ttl} seconds.`
        );
      }

      next();
    } catch (err) {
      // Fail open so rate limiter never blocks legitimate traffic if an unexpected issue occurs
      next();
    }
  };
}
