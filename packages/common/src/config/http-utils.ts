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

function _buildDefaultHeaders(
	options: HttpRequestOptions & Partial<TlsPemBundle>
): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"Accept-Encoding": "gzip, deflate",
		...(options?.headers ?? {}),
	};
}

function _buildUrlParts(url: URL): { hostname: string; port: number; path: string } {
	return {
		hostname: url.hostname,
		port: Number(url.port) || 443,
		path: url.pathname + url.search,
	};
}

function _buildTlsOptions(
	options: HttpRequestOptions & Partial<TlsPemBundle>
): Partial<https.RequestOptions> {
	return {
		cert: options.certPem,
		key: options.keyPem,
		ca: options.caPem,
		rejectUnauthorized: true,
		agent: options?.agent ?? getKeepAliveAgent(),
	};
}

function buildRequestOptions(
	method: HttpMethod,
	url: URL,
	options: HttpRequestOptions & Partial<TlsPemBundle>
): https.RequestOptions {
	return {
		method,
		..._buildUrlParts(url),
		headers: _buildDefaultHeaders(options),
		..._buildTlsOptions(options),
	};
}

export { buildRequestOptions, getKeepAliveAgent };
