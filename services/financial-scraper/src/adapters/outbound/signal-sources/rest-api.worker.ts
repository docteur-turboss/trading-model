import { normalizeError } from "@trading-model/common/utils/errors";
import {
	InvalidPayloadError,
	type ProtocolWorker,
} from "../../../domain/ports/signal-source.port";

const TIMEOUT_MS = 10_000;

/**
 * `rest_api` protocol: GET of the request URL, JSON body. Rejects on a
 * network error, after 10 s, or on a non-2xx status; no retry here, the next
 * tick of the source is the retry. A body that is not JSON rejects with an
 * `InvalidPayloadError`.
 */
export function createRestApiWorker(userAgent: string): ProtocolWorker {
	return async (request, auth) => {
		const url = new URL(request.url);
		const headers: Record<string, string> = {
			accept: "application/json",
			"user-agent": userAgent,
		};
		if (auth !== "none") {
			// An unset key never gets here: the source is not scheduled.
			const key = process.env[auth.env] ?? "";
			if (auth.in === "header") {
				headers[auth.name] = key;
			} else {
				url.searchParams.set(auth.name, key);
			}
		}
		// Rethrown with the host only: a query key must not reach a log.
		const response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		}).catch((err: unknown) => {
			throw new Error(`${normalizeError(err).name} from ${url.host}`);
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(`HTTP ${response.status} from ${url.host}`);
		}
		// Read, then parse: a body cut by the network stays a transport error.
		const body = await response.text();
		try {
			return JSON.parse(body);
		} catch (err) {
			throw new InvalidPayloadError(
				`Body from ${url.host} is not JSON: ${normalizeError(err).message}`
			);
		}
	};
}
