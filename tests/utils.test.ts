import suppressConsoleLogsAsync from '../src/utils';

describe('suppressConsoleLogsAsync', () => {
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    originalConsoleLog = console.log;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('should suppress console.log during execution', async () => {
    let wasCalled = false;
    // Temporarily replace console.log with something that sets a flag
    console.log = () => {
      wasCalled = true;
    };

    await suppressConsoleLogsAsync(async () => {
      console.log('this should be suppressed');
    });

    expect(wasCalled).toBe(false);
  });

  it('should restore console.log after successful execution', async () => {
    const myLog = () => {};
    console.log = myLog;

    await suppressConsoleLogsAsync(async () => {
      expect(console.log).not.toBe(myLog);
    });

    expect(console.log).toBe(myLog);
  });

  it('should return the result of the callback', async () => {
    const expectedResult = { foo: 'bar' };
    const result = await suppressConsoleLogsAsync(async () => {
      return expectedResult as any;
    });

    expect(result).toBe(expectedResult);
  });

  it('should restore console.log even if the callback throws an error', async () => {
    const myLog = () => {};
    console.log = myLog;

    try {
      await suppressConsoleLogsAsync(async () => {
        throw new Error('Callback failed');
      });
    } catch (error) {
      // Expected
    }

    expect(console.log).toBe(myLog);
  });
});
