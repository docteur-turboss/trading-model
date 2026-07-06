import https from "node:https";
import type { URL } from "node:url";
import type { TlsPemBundle } from "../domain/tls-paths";
import type { HttpMethod, HttpRequestOptions } from "./http-types";

let sharedAgent: https.Agent | null = null;

function getKeepAliveAgent(): https.Agent {
	if (!sharedAgent) {
		sharedAgent = new https.Agent({
			keepAlive: true,
			keepAliveMsecs: 30_000,
			maxSockets: 64,
			maxFreeSockets: 16,
			scheduling: "lifo",
		});
	}
	return sharedAgent;
}

function buildRequestOptions(
	method: HttpMethod,
	url: URL,
	options: HttpRequestOptions & Partial<TlsPemBundle>
): https.RequestOptions {
	return {
		method,
		hostname: url.hostname,
		port: url.port || 443,
		path: url.pathname + url.search,
		headers: {
			"Content-Type": "application/json",
			"Accept-Encoding": "gzip, deflate",
			...(options?.headers ?? {}),
		},
		cert: options.cert,
		key: options.key,
		ca: options.ca,
		rejectUnauthorized: true,
		agent: options?.agent ?? getKeepAliveAgent(),
	};
}

export { buildRequestOptions, getKeepAliveAgent };
