import type https from "node:https";
import { HttpMethod } from "@trading-model/validation/contracts/signed-request";
import type { DurationMs, PositiveInt, ServiceId } from "../domain/primitives";
import type { TlsPemBundle } from "../domain/tls-paths";

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

interface HttpRequestOptions {
	timeoutMs?: DurationMs;
	headers?: HttpHeaders;
	retryCount?: PositiveInt;
	agent?: https.Agent;
	serviceName?: ServiceId;
	serviceInstanceCount?: PositiveInt;
}

export type { HttpRequestOptions };
export { HttpMethod };

/** Combines HTTP request options with optional TLS PEM bundle for mTLS connections. */
export type TlsHttpOptions = HttpRequestOptions & Partial<TlsPemBundle>;
