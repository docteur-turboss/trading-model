import { normalizeError } from "@trading-model/common/utils/errors";
import type { HttpMethod } from "../domain/http-types";
import { NODE_ENV } from "../shared/node-env";
import type { LogEntry } from "./log-types";

const ERROR_WEBHOOK_TIMEOUT_MS = 5000;

function _shouldSend(env: string | undefined): boolean {
	return env === NODE_ENV.PRODUCTION || env === NODE_ENV.STAGING;
}

/** Sends an error log entry to the logging service. */
export async function sendError(
	safeStringify: (value: unknown) => string,
	entry: LogEntry,
	env: string | undefined
): Promise<void> {
	// No webhook configured (the default, ""): nothing to send. Posting to "/"
	// failed on every error log and printed "Failed to parse URL".
	const url = process.env.ERROR_URL_WEBHOOK;
	if (!(_shouldSend(env) && url)) {
		return;
	}
	try {
		await fetch(url, {
			method: "POST" as HttpMethod,
			headers: { "Content-Type": "application/json" },
			body: safeStringify(entry),
			signal: AbortSignal.timeout(ERROR_WEBHOOK_TIMEOUT_MS),
		});
	} catch (err) {
		console.error(
			"Failed to send log to service:",
			normalizeError(err).message
		);
	}
}
