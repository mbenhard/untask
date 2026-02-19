/**
 * Extracts a human-readable message from an unknown error value.
 */
export const toErrorMessage = (error: unknown, fallback = 'Unknown error'): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
};
