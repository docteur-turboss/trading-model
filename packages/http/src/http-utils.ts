import https from "node:https";
import type { URL } from "node:url";
import { context, propagation } from "@opentelemetry/api";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import { Port } from "@trading-model/primitives/primitives";
import { Hostname } from "@trading-model/primitives/primitives/hostname";
import { getCorrelationId } from "./correlation-id";
import { buildTlsClientOptions } from "./http-tls-loader";
import type { HttpHeaders, HttpMethod, TlsHttpOptions } from "./http-types";

let sharedAgent: https.Agent | null = null;

export function getKeepAliveAgent(): https.Agent {
	sharedAgent ??= new https.Agent({
		keepAlive: true,
		keepAliveMsecs: 30_000,
		// Below Node's 5 s server keepAliveTimeout: free sockets close before the server resets them.
		timeout: 4000,
		maxSockets: 64,
		maxFreeSockets: 16,
		scheduling: "lifo",
	});
	return sharedAgent;
}

function _buildDefaultHeaders(options: TlsHttpOptions): HttpHeaders {
	const carrier: Record<string, string> = {};
	propagation.inject(context.active(), carrier);

	const correlationId =
		options.headers?.[HTTP_HEADERS.CORRELATION_ID] ?? getCorrelationId();

	return {
		"Content-Type": "application/json",
		"Accept-Encoding": "gzip, deflate",
		...(correlationId ? { [HTTP_HEADERS.CORRELATION_ID]: correlationId } : {}),
		...(carrier.traceparent ? { traceparent: carrier.traceparent } : {}),
		...(carrier.baggage ? { baggage: carrier.baggage } : {}),
		...options.headers,
	};
}

export function buildRequestOptions(
	method: HttpMethod,
	url: URL,
	options: TlsHttpOptions
): https.RequestOptions {
	return {
		method,
		hostname: Hostname.of(url.hostname),
		port: Port.of(Number(url.port) || 443),
		path: url.pathname + url.search,
		headers: _buildDefaultHeaders(options),
		...buildTlsClientOptions(options, options.serviceName),
		rejectUnauthorized: true,
		agent: getKeepAliveAgent(),
	};
}
