export const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;

export const isValidPort = (value: unknown): value is number =>
	typeof value === "number" &&
	Number.isInteger(value) &&
	value > 0 &&
	value <= 65535;

export const isValidIP = (value: unknown): value is string =>
	typeof value === "string" &&
	/^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/.test(
		value
	);

export const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
