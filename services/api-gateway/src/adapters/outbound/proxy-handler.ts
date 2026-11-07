import https from "node:https";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { logger } from "@trading-model/http/infrastructure/logger";
import { HostPort } from "@trading-model/primitives/service-identity";
import { UpstreamResponseTooLargeError } from "../../application/ports";
import { ENV } from "../../infrastructure/config/env";
import type { ProxyRequestOptions } from "./proxy-options-builder";
import { buildProxyOptions } from "./proxy-options-builder";

export interface ProxyResult {
	status: HttpStatusCode;
	body: string;
	headers: Record<string, string | string[]>;
}

export function forwardRequest(
	opts: ProxyRequestOptions
): Promise<ProxyResult> {
	const { req, target, path } = opts;
	return new Promise((resolve, reject) => {
		const payload = _serializeBody(req.body);
		const proxyReq = https.request(
			_withBodyLength(buildProxyOptions(opts), payload),
			(proxyRes) => {
				const chunks: Buffer[] = [];
				let bytes = 0;
				// A destroyed or reset upstream answer errors here: unhandled, it
				// would crash the gateway.
				proxyRes.on("error", reject);
				proxyRes.on("data", (chunk: Buffer) => {
					bytes += chunk.length;
					if (bytes > ENV.PROXY_MAX_RESPONSE_BYTES) {
						// Cut the upstream answer: buffered, then parsed, it would take
						// several times its size in memory (ADR-0053).
						proxyRes.destroy();
						reject(
							new UpstreamResponseTooLargeError(ENV.PROXY_MAX_RESPONSE_BYTES)
						);
						return;
					}
					chunks.push(chunk);
				});
				proxyRes.on("end", () =>
					resolve({
						status: (proxyRes.statusCode ??
							HTTP_STATUS.SERVICE_UNAVAILABLE) as HttpStatusCode,
						body: Buffer.concat(chunks).toString(),
						headers: proxyRes.headers as Record<string, string | string[]>,
					})
				);
			}
		);
		proxyReq.on("error", (err: Error) => {
			logger.error("Proxy request failed", {
				context: {
					target: HostPort.toAddress(target),
					path,
					error: err.message,
				},
			});
			reject(err);
		});
		proxyReq.on("timeout", () => {
			proxyReq.destroy();
			reject(new Error(`Proxy timeout after ${ENV.PROXY_TIMEOUT_MS}ms`));
		});
		if (payload) {
			proxyReq.write(payload);
		}
		proxyReq.end();
	});
}

/** The parsed body, re-serialized: what is actually sent downstream. */
function _serializeBody(body: unknown): string | undefined {
	if (
		body &&
		typeof body === "object" &&
		Object.keys(body as object).length > 0
	) {
		return JSON.stringify(body);
	}
}

/**
 * The client's Content-Length describes its own bytes, not the re-serialized
 * body (formatted JSON is longer): forwarding it makes the service wait for
 * bytes that never come. Declare the length of what is sent instead.
 */
function _withBodyLength(
	options: https.RequestOptions,
	payload: string | undefined
): https.RequestOptions {
	const headers = { ...(options.headers as Record<string, string>) };
	delete headers["content-length"];
	delete headers["transfer-encoding"];
	if (payload) {
		headers["content-length"] = String(Buffer.byteLength(payload));
	}
	return { ...options, headers };
}
