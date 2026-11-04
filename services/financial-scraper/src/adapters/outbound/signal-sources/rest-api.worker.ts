import type { ProtocolWorker } from "../../../domain/ports/signal-source.port";

const TIMEOUT_MS = 10_000;

/**
 * `rest_api` protocol: GET of the request URL, JSON body. Rejects on a
 * network error, after 10 s, or on a non-2xx status; no retry here, the next
 * tick of the source is the retry. A body that is not JSON rejects with a
 * SyntaxError, which the collector counts as an invalid payload.
 */
export function createRestApiWorker(userAgent: string): ProtocolWorker {
	return async (request) => {
		const response = await fetch(request.url, {
			headers: { accept: "application/json", "user-agent": userAgent },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(
				`HTTP ${response.status} from ${new URL(request.url).host}`
			);
		}
		return await response.json();
	};
}
