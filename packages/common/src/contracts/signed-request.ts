import type { ServiceId } from "../domain/primitives";

export interface HttpRoute {
	method: string;
	path: string;
}

export interface SignedRequest extends HttpRoute {
	serviceName: ServiceId;
	body: unknown;
}

export interface SignedRequestAuth {
	timestamp: string;
	signature: string;
}
