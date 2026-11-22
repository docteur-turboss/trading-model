import type { TlsPemBundle } from "@trading-model/common/config/tls-paths";
import { HttpMethod } from "@trading-model/contracts/signed-request";
import type {
	DurationMs,
	ServiceId,
} from "@trading-model/primitives/primitives";

/** Header map of an HTTP request or response. */
export type HttpHeaders = Record<string, string>;

interface HttpRequestOptions {
	timeoutMs?: DurationMs;
	headers?: HttpHeaders;
	/** Retries after the first attempt (default 3); 0 sends the request once. */
	retryCount?: number;
	/**
	 * Whether the request may be sent again after it left. Default: every
	 * method but POST. A non-idempotent request is retried only when the
	 * connection was refused (it never left): a timeout or a reset may come
	 * after the server acted on it.
	 */
	idempotent?: boolean;
	serviceName?: ServiceId;
	/** Aborts the request and its retries. */
	signal?: AbortSignal;
}

export type { HttpRequestOptions };
export { HttpMethod };

/** Combines HTTP request options with optional TLS PEM bundle for mTLS connections. */
export type TlsHttpOptions = HttpRequestOptions & Partial<TlsPemBundle>;
