import https from "node:https";
import type { URL } from "node:url";
import { Port } from "../domain/primitives";
import { Hostname } from "../domain/primitives/hostname";
import type { HttpHeaders, HttpMethod, TlsHttpOptions } from "./http-types";

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

function _buildDefaultHeaders(options: TlsHttpOptions): HttpHeaders {
	return {
		"Content-Type": "application/json",
		"Accept-Encoding": "gzip, deflate",
		...(options?.headers ?? {}),
	};
}

interface UrlParts {
	hostname: Hostname;
	port: Port;
	path: string;
}

function _buildUrlParts(url: URL): UrlParts {
	return {
		hostname: Hostname.of(url.hostname),
		port: Port.of(Number(url.port) || 443),
		path: url.pathname + url.search,
	};
}

function _buildTlsOptions(
	options: TlsHttpOptions
): Partial<https.RequestOptions> {
	const hasCustomTrust = Boolean(options.caPem || options.certPem);
	const tlsOptions: Partial<https.RequestOptions> = {
		cert: options.certPem,
		key: options.keyPem,
		ca: options.caPem,
		rejectUnauthorized: true,
		agent: options?.agent ?? getKeepAliveAgent(),
	};
	if (hasCustomTrust && !options.verifyHostname) {
		tlsOptions.checkServerIdentity = () => undefined;
	}
	return tlsOptions;
}

function buildRequestOptions(
	method: HttpMethod,
	url: URL,
	options: TlsHttpOptions
): https.RequestOptions {
	return {
		method,
		..._buildUrlParts(url),
		headers: _buildDefaultHeaders(options),
		..._buildTlsOptions(options),
	};
}

export { buildRequestOptions, getKeepAliveAgent };
