/**
 * Exponential Backoff with Decorrelated Jitter Retry Utility
 * Designed for enterprise fault tolerance in distributed cloud environments.
 * 
 * Complies with Architecture Task 5: Retry & Backoff Strategies.
 */

/**
 * Checks whether an error is transient and worthy of a retry.
 * @param {Error|any} error
 * @returns {boolean}
 */
export function isTransientError(error) {
  if (!error) return false;

  // Network / Socket level errors
  const transientCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
    'ESOCKETTIMEDOUT',
  ];
  if (error.code && transientCodes.includes(error.code)) return true;

  // PostgreSQL transient errors (deadlocks, serialization failures, connection resets)
  const postgresTransientCodes = ['40001', '40P01', '57P01', '08006', '08001'];
  if (error.code && postgresTransientCodes.includes(error.code)) return true;

  // HTTP 429 (Rate Limited) or 5xx Server Errors (500, 502, 503, 504)
  const status = error.status || error.statusCode || error.response?.status;
  if (status === 429 || (status >= 500 && status <= 599)) return true;

  // Generic timeout message
  if (error.message && /timeout|gateway|network|connection lost/i.test(error.message)) {
    return true;
  }

  return false;
}

/**
 * Execute an asynchronous operation with exponential backoff and jitter.
 * 
 * @template T
 * @param {() => Promise<T>} fn - Asynchronous function to execute
 * @param {Object} [options]
 * @param {number} [options.maxAttempts=3] - Maximum number of attempts
 * @param {number} [options.initialDelayMs=200] - Base delay in milliseconds
 * @param {number} [options.maxDelayMs=5000] - Upper cap for backoff delay
 * @param {number} [options.factor=2] - Exponential multiplier
 * @param {boolean} [options.jitter=true] - Apply randomized full jitter
 * @param {(err: any, attempt: number) => boolean} [options.shouldRetry] - Custom retry filter
 * @param {(err: any, attempt: number, delayMs: number) => void} [options.onRetry] - Retry hook
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelayMs = 200,
    maxDelayMs = 5000,
    factor = 2,
    jitter = true,
    shouldRetry = isTransientError,
    onRetry = null,
  } = options;

  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || (shouldRetry && !shouldRetry(err, attempt))) {
        throw err;
      }

      // Calculate exponential backoff
      const rawDelay = Math.min(
        maxDelayMs,
        initialDelayMs * Math.pow(factor, attempt - 1)
      );

      // Full jitter: random number uniformly distributed between 0 and rawDelay
      const delayMs = jitter ? Math.floor(Math.random() * rawDelay) : rawDelay;

      if (onRetry) {
        onRetry(err, attempt, delayMs);
      } else {
        console.warn(
          `[Retry] Attempt ${attempt}/${maxAttempts} failed (${err.message}). Retrying in ${delayMs}ms...`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
