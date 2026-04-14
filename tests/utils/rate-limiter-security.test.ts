import RateLimiter from '../../src/utils/rate-limiter';

describe('RateLimiter Security', () => {
  let rateLimiter: RateLimiter;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    rateLimiter = new RateLimiter(true); // Enable debug mode
    jest.useFakeTimers();
    // Mock the sleep function to resolve immediately
    jest.spyOn(rateLimiter as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep')
      .mockImplementation(() => Promise.resolve());
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  it('should NOT expose sensitive headers in debug logs', async () => {
    const rateLimitError = new Error('rate limit exceeded');
    const sensitiveHeaders = {
      'authorization': 'Bearer secret-token',
      'cookie': 'session=secret-session',
      'x-api-key': 'secret-key',
      'retry-after': '30'
    };

    Object.assign(rateLimitError, {
      statusCode: 429,
      responseHeaders: sensitiveHeaders,
    });

    const operation = jest.fn().mockRejectedValueOnce(rateLimitError);

    try {
      await rateLimiter.executeWithRateLimiting('test-provider', operation, {
        maxRetries: 0,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitter: false,
      });
    } catch (e) {
      // Expected to throw after 0 retries
    }

    // Check if getRateLimitDebugInfo was called and logged
    const debugCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('Rate limit details for test-provider:')
    );

    expect(debugCall).toBeDefined();
    const debugInfo = debugCall[1];

    expect(debugInfo.errorInfo.headers).toBeDefined();

    // These should be redacted in the fix, but currently they are likely exposed
    // This test will FAIL if they are redacted, which is what we want for reproduction (or we can assert they ARE there now)

    // These should be redacted
    expect(debugInfo.errorInfo.headers['authorization']).toBe('[REDACTED]');
    expect(debugInfo.errorInfo.headers['cookie']).toBe('[REDACTED]');
    expect(debugInfo.errorInfo.headers['x-api-key']).toBe('[REDACTED]');
    // Non-sensitive headers should be preserved
    expect(debugInfo.errorInfo.headers['retry-after']).toBe('30');
  });
});
