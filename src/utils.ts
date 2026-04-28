import { Logger } from './utils/log-utils';

/**
 * Executes an asynchronous callback while temporarily suppressing `console.log` output.
 *
 * This utility is useful for running third-party code or library functions that produce
 * excessive noise in the console, ensuring a cleaner output for the main application.
 *
 * @param callback - The asynchronous function to execute.
 * @returns A promise that resolves to the result of the callback.
 */
async function suppressConsoleLogsAsync(callback: () => Promise<void>) {
  const originalInfo = Logger.info;
  const originalConsoleLog = console.log;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Logger.info = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = () => {};

  try {
    const result = await callback();
    return result;
  } finally {
    Logger.info = originalInfo;
    console.log = originalConsoleLog;
  }
}

export default suppressConsoleLogsAsync;
