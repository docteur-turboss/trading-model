import crypto from "node:crypto";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type { Request } from "express";

const BLOCKED_HEADERS = new Set([
	"x-api-key",
	"authorization",
	"host",
	"connection",
	"keep-alive",
]);

function serializeHeaderValue(value: string | string[]): string {
	return typeof value === "string" ? value : value.join(", ");
}

function addProxyHeaders(headers: Record<string, string>, req: Request): void {
	headers[HTTP_HEADERS.X_FORWARDED_FOR] =
		req.ip ?? req.socket.remoteAddress ?? "unknown";
	headers[HTTP_HEADERS.X_FORWARDED_PROTO] = "https";
	headers[HTTP_HEADERS.X_REQUEST_ID] =
		(req.headers[HTTP_HEADERS.X_REQUEST_ID] as string) ?? crypto.randomUUID();
}

export function safeHeaders(req: Request): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(req.headers)) {
		if (BLOCKED_HEADERS.has(key.toLowerCase())) {
			continue;
		}
		if (typeof value === "string" || Array.isArray(value)) {
			headers[key] = serializeHeaderValue(value);
		}
	}
	addProxyHeaders(headers, req);
	return headers;
}
