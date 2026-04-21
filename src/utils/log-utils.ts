/**
 * Masks sensitive information for logging purposes.
 *
 * @param value - The value to mask.
 * @returns A masked string representation of the value.
 */
export const mask = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null) {
    return '[NULL/UNDEFINED]';
  }
  return '[REDACTED]';
};

export default {
  mask,
};
