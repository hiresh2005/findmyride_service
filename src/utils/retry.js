import logger from './logger.js';

/**
 * Waits a random duration between minMs and maxMs.
 */
export function randomDelay(minMs = 2_000, maxMs = 5_000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Retries an async function up to `maxAttempts` times using exponential backoff.
 *
 * @param {() => Promise<T>} fn          - Async function to execute
 * @param {object}           opts
 * @param {number}           opts.maxAttempts  - Total attempts (default 3)
 * @param {number}           opts.baseDelayMs  - Initial backoff delay in ms (default 2000)
 * @param {string}           opts.label        - Human-readable label for logging
 * @returns {Promise<T>}
 */
export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 2_000, label = 'operation' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) break;

      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${backoff}ms`, {
        error: err.message,
      });
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  logger.error(`${label} failed after ${maxAttempts} attempts`, { error: lastError?.message });
  throw lastError;
}
