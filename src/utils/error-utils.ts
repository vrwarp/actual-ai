interface RateLimitError extends Error {
  statusCode?: number;
  responseHeaders?: {
    'retry-after'?: string;
    'Retry-After'?: string;
  };
  responseBody?: string;
}

/**
 * Checks if an error is a rate limit error (HTTP 429 or similar).
 *
 * @param error - The error object to check.
 * @returns True if the error indicates a rate limit was exceeded, false otherwise.
 */
export const isRateLimitError = (error: unknown): boolean => {
  if (!error) return false;
  const errorStr = error instanceof Error ? error.message : JSON.stringify(error);
  return errorStr.toLowerCase().includes('rate limit')
    || errorStr.toLowerCase().includes('rate_limit')
    || errorStr.toLowerCase().includes('too many requests')
    || (error instanceof Error
      && 'statusCode' in error
      && (error as RateLimitError).statusCode === 429);
};

/**
 * Attempts to extract the recommended wait time (retry-after) from a rate limit error.
 *
 * It checks error messages, response headers, and response bodies for retry information.
 *
 * @param error - The error object to inspect.
 * @returns The time to wait in milliseconds, or undefined if no information is found.
 */
export const extractRetryAfterMs = (error: unknown): number | undefined => {
  if (!isRateLimitError(error)) return undefined;

  if (error instanceof Error) {
    try {
      const match = /try again in (\d+(\.\d+)?)s/i.exec(error.message);
      if (match?.[1]) {
        return Math.ceil(parseFloat(match[1]) * 1000);
      }
      if ('responseHeaders' in error && (error as RateLimitError).responseHeaders) {
        const headers = (error as RateLimitError).responseHeaders;
        if (headers?.['retry-after'] || headers?.['Retry-After']) {
          const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
          if (retryAfter && !Number.isNaN(Number(retryAfter))) {
            return Number(retryAfter) * 1000;
          }
        }
      }

      if ('responseBody' in error) {
        const { responseBody } = (error as RateLimitError);
        if (typeof responseBody === 'string') {
          try {
            const body = JSON.parse(responseBody) as { error?: { reset_time?: number } };
            if (body.error?.reset_time) {
              return body.error.reset_time * 1000;
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
      }
    } catch (e) {
      console.warn('Error extracting retry-after information:', e);
    }
  }

  return undefined;
};

/**
 * Formats an error object into a readable string.
 *
 * @param error - The error to format.
 * @returns A string representation of the error.
 */
export const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return '[object Object]';
    }
  }
  return String(error);
};

export default {
  isRateLimitError,
  extractRetryAfterMs,
  formatError,
};
