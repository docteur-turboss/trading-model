import crypto from "node:crypto";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type { Request } from "express";

export class HeaderSanitizer {
	safeHeaders(req: Request): Record<string, string> {
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(req.headers)) {
			if (this._isBlocked(key)) {
				continue;
			}
			if (typeof value === "string" || Array.isArray(value)) {
				headers[key] = this._serialize(value);
			}
		}
		this._addProxyHeaders(headers, req);
		return headers;
	}

	private _isBlocked(key: string): boolean {
		const lower = key.toLowerCase();
		return (
			lower === "x-api-key" ||
			lower === "authorization" ||
			lower === "host" ||
			lower === "connection" ||
			lower === "keep-alive"
		);
	}

	private _serialize(value: string | string[]): string {
		return typeof value === "string" ? value : value.join(", ");
	}

	private _addProxyHeaders(
		headers: Record<string, string>,
		req: Request
	): void {
		headers[HTTP_HEADERS.X_FORWARDED_FOR] =
			req.ip ?? req.socket.remoteAddress ?? "unknown";
		headers[HTTP_HEADERS.X_FORWARDED_PROTO] = "https";
		headers[HTTP_HEADERS.X_REQUEST_ID] =
			(req.headers[HTTP_HEADERS.X_REQUEST_ID] as string) ?? crypto.randomUUID();
	}
}

export const headerSanitizer = new HeaderSanitizer();
