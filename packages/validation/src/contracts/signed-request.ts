import type { ServiceId } from "@trading-model/common/domain/primitives";

export enum HttpMethod {
	Get = "GET",
	Post = "POST",
	Put = "PUT",
	Patch = "PATCH",
	Delete = "DELETE",
	Head = "HEAD",
	Options = "OPTIONS",
}

export interface HttpRoute {
	method: HttpMethod;
	path: string;
}

export interface SignedRequest extends HttpRoute {
	serviceName: ServiceId;
	body: unknown;
}

/** A cryptographic signature string (HMAC-SHA256 hex or base64). */
export type Signature = string & { readonly brand: "Signature" };
/** A UNIX-millisecond timestamp string used in request signing. */
export type Timestamp = string & { readonly brand: "Timestamp" };

export interface SignedRequestAuth {
	timestamp: Timestamp;
	signature: Signature;
}
