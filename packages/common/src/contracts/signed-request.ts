import type { ServiceId } from "../domain/primitives";

/** Standard HTTP method verbs. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface HttpRoute {
	method: HttpMethod;
	path: string;
}

export interface SignedRequest extends HttpRoute {
	serviceName: ServiceId;
	body: unknown;
}

/** A cryptographic signature string (HMAC-SHA256 hex or base64). */
export type Signature = string & { readonly __brand: "Signature" };
/** A UNIX-millisecond timestamp string used in request signing. */
export type Timestamp = string & { readonly __brand: "Timestamp" };

export interface SignedRequestAuth {
	timestamp: Timestamp;
	signature: Signature;
}
