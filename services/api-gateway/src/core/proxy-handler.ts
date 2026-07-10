import crypto from "node:crypto";
import type http from "node:http";
import https from "node:https";
import { CRYPTO } from "@trading-model/common/crypto/crypto-constants";
import { logger } from "@trading-model/common/config/logger";
import type { ServiceEndpoint } from "@trading-model/common/contracts/service-resolver.types";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type { Request } from "express";
import { ENV } from "../config/env";

export interface ProxyResult {
	status: HttpStatusCode;
	body: string;
	headers: Record<string, string | string[]>;
}

function _isBlockedHeader(key: string): boolean {
	const lower = key.toLowerCase();
	return (
		lower === "x-api-key" ||
		lower === "authorization" ||
		lower === "host" ||
		lower === "connection" ||
		lower === "keep-alive"
	);
}

function _serializeHeaderValue(value: string | string[]): string {
	return typeof value === "string" ? value : value.join(", ");
}

function _addProxyHeaders(headers: Record<string, string>, req: Request): void {
	headers[HTTP_HEADERS.X_FORWARDED_FOR] =
		req.ip ?? req.socket.remoteAddress ?? "unknown";
	headers[HTTP_HEADERS.X_FORWARDED_PROTO] = "https";
	headers[HTTP_HEADERS.X_REQUEST_ID] =
		(req.headers[HTTP_HEADERS.X_REQUEST_ID] as string) ?? crypto.randomUUID();
}

function buildSafeHeaders(req: Request): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(req.headers)) {
		if (_isBlockedHeader(key)) {
			continue;
		}
		if (typeof value === "string" || Array.isArray(value)) {
			headers[key] = _serializeHeaderValue(value);
		}
	}
	_addProxyHeaders(headers, req);
	return headers;
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
		status: (proxyRes.statusCode ?? HTTP_STATUS.SERVICE_UNAVAILABLE) as HttpStatusCode,
		body: Buffer.concat(chunks).toString(CRYPTO.UTF8),
		headers: proxyRes.headers as Record<string, string | string[]>,
	};
}

export interface ProxyRequestOptions {
	req: Request;
	target: ServiceEndpoint;
	path: string;
	timeoutMs?: number;
}

function _onProxyError(
	target: ServiceEndpoint,
	path: string,
	reject: (err: Error) => void
): (err: Error) => void {
	return (err: Error) => {
		logger.error("Proxy request failed", {
			context: {
				target: `${target.host}:${target.port}`,
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
	target: ServiceEndpoint;
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
		const options = _buildProxyOptions({ target, req, path, timeoutMs });
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

function _buildProxyOptions(opts: ProxyRequestOptions): https.RequestOptions {
	const { target, req, path, timeoutMs = ENV.PROXY_TIMEOUT_MS } = opts;
	const url = new URL(path, `https://${target.host}:${target.port}`);
	return {
		hostname: target.host,
		port: target.port,
		path: url.pathname + url.search,
		method: req.method,
		headers: buildSafeHeaders(req),
		rejectUnauthorized: true,
		timeout: timeoutMs,
	};
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
