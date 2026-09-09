import type http from "node:http";
import https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import { HostPort } from "@trading-model/common/domain/service-identity";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import { CryptoAlg } from "@trading-model/crypto/domain/constants/crypto-constants";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";
import type { Request } from "express";
import { ENV } from "../../infrastructure/config/env";
import type { ProxyRequestOptions } from "./proxy-options-builder";
import { tlsOptionsBuilder } from "./proxy-options-builder";

export interface ProxyResult {
	status: HttpStatusCode;
	body: string;
	headers: Record<string, string | string[]>;
}

function _collectResponseChunks(
	proxyRes: http.IncomingMessage
): Promise<Buffer[]> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
		proxyRes.on("end", () => resolve(chunks));
	});
}

async function handleProxyResponse(
	proxyRes: http.IncomingMessage
): Promise<ProxyResult> {
	const chunks = await _collectResponseChunks(proxyRes);
	return {
		status: (proxyRes.statusCode ??
			HTTP_STATUS.SERVICE_UNAVAILABLE) as HttpStatusCode,
		body: Buffer.concat(chunks).toString(CryptoAlg.UTF8),
		headers: proxyRes.headers as Record<string, string | string[]>,
	};
}

function _onProxyError(
	target: ResolvedEndpoint,
	path: string,
	reject: (err: Error) => void
): (err: Error) => void {
	return (err: Error) => {
		logger.error("Proxy request failed", {
			context: {
				target: HostPort.toAddress(target),
				path,
				error: err.message,
			},
		});
		reject(err);
	};
}

function _onProxyTimeout(
	timeoutMs: number,
	proxyReq: http.ClientRequest,
	reject: (err: Error) => void
): void {
	proxyReq.destroy();
	reject(new Error(`Proxy timeout after ${timeoutMs}ms`));
}

interface ProxyExecutionContext {
	options: https.RequestOptions;
	req: Request;
	resolve: (result: ProxyResult) => void;
	reject: (err: Error) => void;
	target: ResolvedEndpoint;
	path: string;
	timeoutMs: number;
}

function _executeProxyRequest(ctx: ProxyExecutionContext): void {
	const { options, req, resolve, reject, target, path, timeoutMs } = ctx;
	const proxyReq = https.request(options, (proxyRes) => {
		void handleProxyResponse(proxyRes).then(resolve);
	});
	proxyReq.on("error", _onProxyError(target, path, reject));
	proxyReq.on("timeout", () => _onProxyTimeout(timeoutMs, proxyReq, reject));
	_writeRequestBody(proxyReq, req.body);
	proxyReq.end();
}

export function forwardRequest(
	opts: ProxyRequestOptions
): Promise<ProxyResult> {
	const { req, target, path, timeoutMs = ENV.PROXY_TIMEOUT_MS } = opts;
	return new Promise((resolve, reject) => {
		const options = tlsOptionsBuilder.buildOptions({
			target,
			req,
			path,
			timeoutMs,
		});
		_executeProxyRequest({
			options,
			req,
			resolve,
			reject,
			target,
			path,
			timeoutMs,
		});
	});
}

function _writeRequestBody(proxyReq: http.ClientRequest, body: unknown): void {
	if (
		body &&
		typeof body === "object" &&
		Object.keys(body as object).length > 0
	) {
		proxyReq.write(JSON.stringify(body));
	}
}
