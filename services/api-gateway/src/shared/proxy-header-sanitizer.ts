import crypto from "node:crypto";
import { anonymizeIp } from "@trading-model/common/utils/anonymize-ip";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import type { Request } from "express";

import { ENV } from "../infrastructure/config/env";

// x-real-ip carries the caller's address: only the anonymized
// X-Forwarded-For set below reaches the services.
// x-actor is set below from the API key: a client must not choose its own.
const BLOCKED_HEADERS = new Set([
	"x-api-key",
	"authorization",
	"host",
	"connection",
	"keep-alive",
	"x-real-ip",
	HTTP_HEADERS.X_ACTOR,
]);

function serializeHeaderValue(value: string | string[]): string {
	return typeof value === "string" ? value : value.join(", ");
}

function addProxyHeaders(headers: Record<string, string>, req: Request): void {
	headers[HTTP_HEADERS.X_FORWARDED_FOR] =
		anonymizeIp(req.ip ?? req.socket.remoteAddress) ?? "unknown";
	headers[HTTP_HEADERS.X_FORWARDED_PROTO] = "https";
	headers[HTTP_HEADERS.X_REQUEST_ID] =
		(req.headers[HTTP_HEADERS.X_REQUEST_ID] as string) ?? crypto.randomUUID();
	// The key name, never the key: dlq-service records it in the audit trail (ADR-0059).
	const actor = (req as Request & { apiKeyName?: string | null }).apiKeyName;
	if (actor) {
		headers[HTTP_HEADERS.X_ACTOR] = actor;
	}
}

export function safeHeaders(req: Request): Record<string, string> {
	const headers: Record<string, string> = {};
	// AUTH_TOKEN_HEADER is configurable: the header carrying the key must not leave either.
	const tokenHeader = ENV.AUTH_TOKEN_HEADER.toLowerCase();
	for (const [key, value] of Object.entries(req.headers)) {
		const name = key.toLowerCase();
		if (BLOCKED_HEADERS.has(name) || name === tokenHeader) {
			continue;
		}
		if (typeof value === "string" || Array.isArray(value)) {
			headers[key] = serializeHeaderValue(value);
		}
	}
	addProxyHeaders(headers, req);
	return headers;
}
