import type { TlsPemBundle } from "@trading-model/common/config/tls-paths";
import { HttpMethod } from "@trading-model/common/contracts/signed-request";
import type {
	DurationMs,
	PositiveInt,
	ServiceId,
} from "@trading-model/common/domain/primitives";

export type HttpHeaderValue = string & { readonly brand: "HttpHeaderValue" };
export const HttpHeaderValue = {
	of(value: string): HttpHeaderValue {
		if (typeof value !== "string") {
			throw new RangeError(
				`HttpHeaderValue must be a string, got ${typeof value}`
			);
		}
		return value as HttpHeaderValue;
	},
};

export type HttpHeaders = Record<string, string>;

export interface HttpHeaderDefaults {
	"content-type"?: HttpHeaderValue;
	authorization?: HttpHeaderValue;
	"x-request-id"?: HttpHeaderValue;
	"x-trace-id"?: HttpHeaderValue;
}

/**
 * Abstract HTTP connection agent handle. Domain code never dereferences it;
 * infrastructure adapters narrow it to their runtime type (e.g. `node:https` `Agent`).
 */
export interface HttpAgent {
	destroy(): void;
}

interface HttpRequestOptions {
	timeoutMs?: DurationMs;
	headers?: HttpHeaders;
	retryCount?: PositiveInt;
	agent?: HttpAgent;
	serviceName?: ServiceId;
	serviceInstanceCount?: PositiveInt;
	/**
	 * When using a custom trust bundle (mTLS / SPIFFE SVIDs), Node's default
	 * hostname verification is disabled because SVIDs carry only a `spiffe://`
	 * URI SAN. Set this to `true` to re-enable standard hostname verification.
	 */
	verifyHostname?: boolean;
}

export type { HttpRequestOptions };
export { HttpMethod };

/** Combines HTTP request options with optional TLS PEM bundle for mTLS connections. */
export type TlsHttpOptions = HttpRequestOptions & Partial<TlsPemBundle>;
