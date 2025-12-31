export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export const isValidPort = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 65535;

export const isValidIP = (v: unknown): v is string =>
  typeof v === "string" &&
  /^(?:\d{1,3}\.){3}\d{1,3}$/.test(v); // IPv4 only (explicit by design)

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);