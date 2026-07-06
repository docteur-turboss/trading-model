export interface HttpRoute {
	method: string;
	path: string;
}

export interface SignedRequest extends HttpRoute {
	serviceName: string;
	body: unknown;
}

export interface SignedRequestAuth {
	timestamp: string;
	signature: string;
}
