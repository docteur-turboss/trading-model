import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { ApiError } from "../types/dtos";

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL ?? "/v1";

let adminToken = import.meta.env.VITE_ADMIN_TOKEN ?? "";

export function setAdminToken(token: string) {
	adminToken = token;
}

export function toQuery(params?: Record<string, unknown>): string {
	if (!params) {
		return "";
	}
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== ""
	);
	if (entries.length === 0) {
		return "";
	}
	return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;
}

export async function request<TData>(
	method: string,
	path: string,
	body?: unknown
): Promise<TData> {
	const res = await fetch(`${API_BASE}${path}`, {
		method,
		headers: {
			[HTTP_HEADERS.CONTENT_TYPE]: "application/json",
			[HTTP_HEADERS.X_API_KEY]: adminToken,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new ApiError(
			res.status,
			(err as { error?: string }).error ?? "Unknown error"
		);
	}
	return res.json() as Promise<TData>;
}
