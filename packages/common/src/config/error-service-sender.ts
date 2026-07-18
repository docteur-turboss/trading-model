import { normalizeError } from "../utils/errors";
import type { HttpMethod } from "./http-types";
import type { LogEntry } from "./log-types";
import { NODE_ENV } from "./node-env";

function _shouldSend(env: string | undefined): boolean {
	return env === NODE_ENV.PRODUCTION || env === NODE_ENV.STAGING;
}

export async function sendError(
	safeStringify: (value: unknown) => string,
	entry: LogEntry,
	env: string | undefined
): Promise<void> {
	if (!_shouldSend(env)) {
		return;
	}
	try {
		await fetch(process.env.ERROR_URL_WEBHOOK ?? "/", {
			method: "POST" as HttpMethod,
			headers: { "Content-Type": "application/json" },
			body: safeStringify(entry),
		});
	} catch (err) {
		console.error(
			"Failed to send log to service:",
			normalizeError(err).message
		);
	}
}
