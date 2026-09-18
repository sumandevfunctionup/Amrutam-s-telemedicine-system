import { formatDatesInObject, getCurrentUtcDateTime } from './date.js';

/**
 * Standardized API success response helper
 * Automatically formats all Date/timestamp fields into UTC 'yyyy-mm-dd hh:mm:ss'
 * @param {import('express').Response} res
 * @param {any} data
 * @param {string} message
 * @param {number} statusCode
 */
export function successResponse(res, data = null, message = 'Success', statusCode = 200) {
  const formattedData = data !== null ? formatDatesInObject(data) : null;

  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data: formattedData,
    timestamp: getCurrentUtcDateTime(),
  });
}

/**
 * Standardized API error response helper
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} statusCode
 * @param {any} errors
 */
export function errorResponse(res, message = 'An error occurred', statusCode = 500, errors = null) {
  const payload = {
    success: false,
    statusCode,
    message,
    timestamp: getCurrentUtcDateTime(),
  };

  if (errors !== null) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
}

// ==========================================
// Specialized HTTP Status Helpers
// ==========================================

/**
 * 200 OK — Successful retrieval or general success
 */
export function ok(res, data = null, message = 'Operation successful') {
  return successResponse(res, data, message, 200);
}

/**
 * 201 Created — Successful resource creation (users, doctors, slots, bookings, prescriptions)
 */
export function created(res, data = null, message = 'Resource created successfully') {
  return successResponse(res, data, message, 201);
}

/**
 * 204 No Content — Action succeeded with no response body (e.g. deletion)
 */
export function noContent(res) {
  return res.status(204).send();
}

/**
 * 400 Bad Request — Validation or client input errors
 */
export function badRequest(res, message = 'Bad request', errors = null) {
  return errorResponse(res, message, 400, errors);
}

/**
 * 401 Unauthorized — Authentication required or invalid/expired credentials
 */
export function unauthorized(res, message = 'Authentication required', errors = null) {
  return errorResponse(res, message, 401, errors);
}

/**
 * 403 Forbidden — Authenticated user lacks permission / role
 */
export function forbidden(res, message = 'Access denied: insufficient permissions', errors = null) {
  return errorResponse(res, message, 403, errors);
}

/**
 * 404 Not Found — Resource does not exist
 */
export function notFound(res, message = 'Requested resource not found') {
  return errorResponse(res, message, 404);
}

/**
 * 409 Conflict — State conflict (e.g. slot already booked, duplicate unique key, version mismatch)
 */
export function conflict(res, message = 'Resource conflict', errors = null) {
  return errorResponse(res, message, 409, errors);
}

/**
 * 422 Unprocessable Entity — Syntactically valid request could not be processed
 */
export function unprocessable(res, message = 'Unprocessable entity', errors = null) {
  return errorResponse(res, message, 422, errors);
}

/**
 * 429 Too Many Requests — Rate limit exceeded
 */
export function tooManyRequests(res, message = 'Too many requests. Please try again later.') {
  return errorResponse(res, message, 429);
}

/**
 * 500 Internal Server Error — Unhandled server exception
 */
export function serverError(res, message = 'Internal server error', errors = null) {
  return errorResponse(res, message, 500, errors);
}

/**
 * 503 Service Unavailable — Database or downstream service down
 */
export function serviceUnavailable(res, message = 'Service temporarily unavailable') {
  return errorResponse(res, message, 503);
}
