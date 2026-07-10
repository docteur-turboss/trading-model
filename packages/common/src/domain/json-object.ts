/**
 * Represents a generic JSON-serializable object with string keys
 * and unknown values. Use this instead of `Record<string, unknown>`
 * when the shape of the data is genuinely unknown.
 */
export type JsonObject = Record<string, unknown>;
