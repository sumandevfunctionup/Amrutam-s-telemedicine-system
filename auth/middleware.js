import { db } from '../db/db.js';
import { verifyAccessToken } from '../helper/jwt.js';
import { errorResponse, unauthorized, forbidden, notFound, serverError } from '../helper/apiResponse.js';
import { isJwtRevoked, cacheGet, cacheSet } from '../helper/redis.js';

/**
 * Authentication middleware: verifies JWT access token and attaches active user to req.user
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Access denied. Bearer token required.');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return unauthorized(res, 'Invalid authorization format.');
  }

  try {
    // Check if token was revoked via Redis blacklist
    const revoked = await isJwtRevoked(token);
    if (revoked) {
      return unauthorized(res, 'Token has been revoked. Please log in again.', {
        code: 'TOKEN_REVOKED',
      });
    }

    const decoded = verifyAccessToken(token);

    // Fast user lookup via Redis cache (60s TTL)
    const cacheKey = `amrutam:user:${decoded.sub}`;
    let user = await cacheGet(cacheKey);

    if (!user) {
      user = await db('users')
        .where({ id: decoded.sub })
        .select('id', 'email', 'role', 'phone_number', 'is_mfa_enabled', 'status')
        .first();

      if (user) {
        await cacheSet(cacheKey, user, 60); // 1 minute session cache
      }
    }

    if (!user) {
      return unauthorized(res, 'User account no longer exists.');
    }

    if (user.status !== 'active') {
      return forbidden(res, `Account is ${user.status}. Please contact support.`);
    }

    req.user = user;
    req.token = token;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return unauthorized(res, 'Access token has expired. Please refresh.', {
        code: 'TOKEN_EXPIRED',
      });
    }
    return unauthorized(res, 'Invalid or malformed authentication token.');
  }
}

/**
 * Role-Based Access Control (RBAC) middleware
 * @param {...string} roles Allowed roles ('admin', 'doctor', 'patient')
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorized(res, 'Authentication required before authorization.');
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return forbidden(
        res,
        `Forbidden: role '${req.user.role}' is not authorized to access this resource.`
      );
    }

    return next();
  };
}

/**
 * Write Idempotency Middleware (PRD Bonus +10 Requirement)
 * Intercepts Idempotency-Key header on mutating requests (POST, PUT, PATCH).
 * Checks Redis cache first (< 5ms), falling back to `idempotency_keys` table.
 */
export async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];

  // If no idempotency key is provided, proceed normally
  if (!key) {
    return next();
  }

  // Only apply to mutating requests
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const userId = req.user ? req.user.id : null;
  const redisCacheKey = `amrutam:idempotency:${key}`;

  try {
    // 1. Fast Redis check (< 5ms)
    const cachedResponse = await cacheGet(redisCacheKey);
    if (cachedResponse && cachedResponse.status) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(cachedResponse.status).json(cachedResponse.body);
    }

    // 2. PostgreSQL check
    const existingRecord = await db('idempotency_keys')
      .where({ key })
      .andWhere('expires_at', '>', new Date())
      .first();

    if (existingRecord && existingRecord.response_status) {
      const parsedBody =
        typeof existingRecord.response_body === 'string'
          ? JSON.parse(existingRecord.response_body)
          : existingRecord.response_body;

      // Populate Redis for future sub-millisecond lookups
      await cacheSet(redisCacheKey, { status: existingRecord.response_status, body: parsedBody }, 86400);

      res.setHeader('X-Cache-Lookup', 'HIT-DB');
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(existingRecord.response_status).json(parsedBody);
    }

    // 3. Intercept res.json to capture and cache response
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const statusCode = res.statusCode || 200;

      // If request succeeded (2xx), cache in Redis and DB
      if (statusCode >= 200 && statusCode < 300) {
        // Cache in Redis (24-hour TTL)
        cacheSet(redisCacheKey, { status: statusCode, body }, 86400).catch(() => {});

        if (userId) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          db('idempotency_keys')
            .insert({
              key,
              user_id: userId,
              request_path: req.originalUrl,
              request_params: req.body ? JSON.stringify(req.body) : null,
              response_status: statusCode,
              response_body: JSON.stringify(body),
              expires_at: expiresAt,
            })
            .catch((err) => {
              console.error('[Idempotency] Failed to cache response in DB:', err.message);
            });
        }
      }

      return originalJson(body);
    };

    return next();
  } catch (err) {
    console.error('[Idempotency] Error processing idempotency:', err);
    return next();
  }
}

/**
 * 404 Not Found route handler
 */
export function notFoundHandler(req, res, next) {
  return errorResponse(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

/**
 * Centralized global error handling middleware
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const errors = process.env.NODE_ENV === 'development' ? { stack: err.stack } : null;

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  return errorResponse(res, message, statusCode, errors);
}
