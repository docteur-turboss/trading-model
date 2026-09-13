import { normalizeError } from "@trading-model/common/utils/errors";
import type { LogEntry } from "../../infrastructure/log-types";
import type { HttpMethod } from "../../shared/http-types";
import { NODE_ENV } from "../../shared/node-env";

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
