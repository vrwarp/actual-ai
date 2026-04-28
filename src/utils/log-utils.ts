import { isFeatureEnabled } from '../config';

/**
 * Masks sensitive information for logging purposes.
 *
 * @param value - The value to mask.
 * @returns A masked string representation of the value.
 */
export const mask = (value: string | number | undefined | null): string => {
  if (isFeatureEnabled('disableMasking')) {
    return String(value);
  }

  if (value === undefined || value === null) {
    return '[NULL/UNDEFINED]';
  }
  return '[REDACTED]';
};

/**
 * Simple logger utility that wraps console methods.
 * This provides a central point for logging that can be easily extended or replaced later.
 */
export const Logger = {
  /**
   * Logs an informational message.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  info: (message: any, ...optionalParams: any[]): void => {
    console.log(message, ...optionalParams);
  },

  /**
   * Logs a warning message.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  warn: (message: any, ...optionalParams: any[]): void => {
    console.warn(message, ...optionalParams);
  },

  /**
   * Logs an error message.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  error: (message: any, ...optionalParams: any[]): void => {
    console.error(message, ...optionalParams);
  },

  /**
   * Logs a debug message.
   * Currently maps to console.log as there's no specific debug level in standard console.
   * @param message - The message to log.
   * @param optionalParams - Additional parameters to log.
   */
  debug: (message: any, ...optionalParams: any[]): void => {
    console.debug(message, ...optionalParams);
  },
};

export default {
  mask,
  Logger,
};
