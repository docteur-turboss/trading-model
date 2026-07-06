import type http from "node:http";
import https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import type { Request } from "express";
import { ENV } from "../config/env";
import type { ResolvedTarget } from "./service-resolver";

export interface ProxyResult {
	status: number;
	body: string;
	headers: Record<string, string | string[]>;
}

function _isBlockedHeader(key: string): boolean {
	const lower = key.toLowerCase();
	return lower === "x-api-key" || lower === "authorization" || lower === "host" ||
		lower === "connection" || lower === "keep-alive";
}

function _serializeHeaderValue(value: string | string[]): string {
	return typeof value === "string" ? value : value.join(", ");
}

function _addProxyHeaders(headers: Record<string, string>, req: Request): void {
	headers["x-forwarded-for"] = req.ip ?? req.socket.remoteAddress ?? "unknown";
	headers["x-forwarded-proto"] = "https";
	headers["x-request-id"] = (req.headers["x-request-id"] as string) ?? crypto.randomUUID();
}

function buildSafeHeaders(req: Request): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(req.headers)) {
		if (_isBlockedHeader(key)) continue;
		if (typeof value === "string" || Array.isArray(value)) {
			headers[key] = _serializeHeaderValue(value);
		}
	}
	_addProxyHeaders(headers, req);
	return headers;
}

function handleProxyResponse(
	proxyRes: http.IncomingMessage
): Promise<ProxyResult> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
		proxyRes.on("end", () => {
			const body = Buffer.concat(chunks).toString("utf8");
			resolve({
				status: proxyRes.statusCode ?? 503,
				body,
				headers: proxyRes.headers as Record<string, string | string[]>,
			});
		});
	});
}

export interface ProxyRequestOptions {
	req: Request;
	target: ResolvedTarget;
	path: string;
	timeoutMs?: number;
}

export function forwardRequest(
	opts: ProxyRequestOptions
): Promise<ProxyResult> {
	const { req, target, path, timeoutMs = ENV.PROXY_TIMEOUT_MS } = opts;
	return new Promise((resolve, reject) => {
		const options: https.RequestOptions = _buildProxyOptions({
			target,
			req,
			path,
			timeoutMs,
		});

		const proxyReq = https.request(options, (proxyRes) => {
			void handleProxyResponse(proxyRes).then(resolve);
		});

		proxyReq.on("error", (err) => {
			logger.error("Proxy request failed", { context: {
				target: `${target.host}:${target.port}`,
				path,
				error: err.message,
			} });
			reject(err);
		});

		proxyReq.on("timeout", () => {
			proxyReq.destroy();
			reject(new Error(`Proxy timeout after ${timeoutMs}ms`));
		});

		_writeRequestBody(proxyReq, req.body);
		proxyReq.end();
	});
}

function _buildProxyOptions(
	opts: ProxyRequestOptions
): https.RequestOptions {
	const { target, req, path, timeoutMs = ENV.PROXY_TIMEOUT_MS } = opts;
	const url = new URL(path, `https://${target.host}:${target.port}`);
	const headers = buildSafeHeaders(req);
	return {
		hostname: target.host,
		port: target.port,
		path: url.pathname + url.search,
		method: req.method,
		headers,
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
