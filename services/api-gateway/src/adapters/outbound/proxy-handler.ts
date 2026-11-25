import https from "node:https";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { logger } from "@trading-model/http/logger";
import { HostPort } from "@trading-model/primitives/service-identity";
import {
	ProxyOverloadedError,
	UpstreamResponseTooLargeError,
	UpstreamTimeoutError,
} from "../../domain/ports/gateway.port";
import type { Env } from "../../infrastructure/config/env";
import type { ProxyRequestOptions } from "./proxy-options-builder";
import { buildProxyOptions } from "./proxy-options-builder";

export interface ProxyResult {
	status: HttpStatusCode;
	body: string;
	headers: Record<string, string | string[]>;
}

let inFlight = 0;

export function forwardRequest(
	opts: ProxyRequestOptions,
	env: Env
): Promise<ProxyResult> {
	if (inFlight >= env.PROXY_MAX_CONCURRENT) {
		return Promise.reject(new ProxyOverloadedError(env.PROXY_MAX_CONCURRENT));
	}
	inFlight++;
	return _forward(opts, env).finally(() => {
		inFlight--;
	});
}

function _forward(opts: ProxyRequestOptions, env: Env): Promise<ProxyResult> {
	const { req, target, path } = opts;
	return new Promise((resolve, rejectRaw) => {
		// Total deadline (send + whole answer): a socket idle timeout never fires
		// on an upstream that trickles a byte every few seconds.
		const deadline = setTimeout(() => {
			proxyReq.destroy();
			rejectRaw(new UpstreamTimeoutError(env.PROXY_TIMEOUT_MS));
		}, env.PROXY_TIMEOUT_MS);
		const reject = (err: Error) => {
			clearTimeout(deadline);
			rejectRaw(err);
		};
		const payload = _serializeBody(req.body);
		const proxyReq = https.request(
			_withBodyLength(buildProxyOptions(opts, env), payload),
			(proxyRes) => {
				const chunks: Buffer[] = [];
				let bytes = 0;
				// A destroyed or reset upstream answer errors here: unhandled, it
				// would crash the gateway.
				proxyRes.on("error", reject);
				proxyRes.on("data", (chunk: Buffer) => {
					bytes += chunk.length;
					if (bytes > env.PROXY_MAX_RESPONSE_BYTES) {
						// Cut the upstream answer: buffered, then parsed, it would take
						// several times its size in memory (ADR-0054).
						proxyRes.destroy();
						reject(
							new UpstreamResponseTooLargeError(env.PROXY_MAX_RESPONSE_BYTES)
						);
						return;
					}
					chunks.push(chunk);
				});
				proxyRes.on("end", () => {
					clearTimeout(deadline);
					resolve({
						status: (proxyRes.statusCode ??
							HTTP_STATUS.SERVICE_UNAVAILABLE) as HttpStatusCode,
						body: Buffer.concat(chunks).toString(),
						headers: proxyRes.headers as Record<string, string | string[]>,
					});
				});
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
