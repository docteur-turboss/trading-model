/** Checks that a value is a non-empty string after trimming. */
export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

/** Checks that a value is a valid TCP port number (1–65535). */
export const isValidPort = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 65535;

/** Checks that a value is a valid IPv4 address string (each octet 0–255). */
export const isValidIP = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/.test(v);

/** Checks that a value is a plain non-null, non-array object. */
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
