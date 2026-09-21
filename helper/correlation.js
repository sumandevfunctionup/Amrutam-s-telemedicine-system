import crypto from 'crypto';

/**
 * Middleware that extracts or assigns a unique X-Correlation-ID to each incoming HTTP request.
 * Propagates the ID to response headers and request context for distributed tracing.
 */
export function correlationMiddleware(req, res, next) {
  const correlationId =
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
