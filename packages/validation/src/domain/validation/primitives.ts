export const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;

export const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
