import { normalizeError } from "@trading-model/common/utils/errors";
import {
	HttpStatusError,
	InvalidPayloadError,
	type ProtocolWorker,
} from "../../../domain/ports/signal-source.port";

const TIMEOUT_MS = 10_000;

/**
 * `rest_api` protocol: GET of the request URL, JSON body. Rejects on a
 * network error, after 10 s, or on a non-2xx status; no retry here, the
 * collector spaces the next ticks of a failing source. A body that is not
 * JSON rejects with an `InvalidPayloadError`.
 */
export function createRestApiWorker(userAgent: string): ProtocolWorker {
	return async (request) => {
		const response = await fetch(request.url, {
			headers: { accept: "application/json", "user-agent": userAgent },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new HttpStatusError(
				`HTTP ${response.status} from ${new URL(request.url).host}`,
				response.status,
				response.headers.get("retry-after") ?? undefined
			);
		}
		// Read, then parse: a body cut by the network stays a transport error.
		const body = await response.text();
		try {
			return JSON.parse(body);
		} catch (err) {
			throw new InvalidPayloadError(
				`Body from ${new URL(request.url).host} is not JSON: ${normalizeError(err).message}`
			);
		}
	};
}
