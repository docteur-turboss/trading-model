/** Minimal HTTP client error — kept local to avoid CJS dependency in Vite build. */
export class HttpClientError extends Error {
	readonly name = "HttpClientError" as const;
	constructor(
		message: string,
		readonly statusCode?: number
	) {
		super(message);
	}
}

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL ?? "/v1";

let adminToken = import.meta.env.VITE_ADMIN_TOKEN ?? "";

const CONTENT_TYPE = "Content-Type";
const X_API_KEY = "x-api-key";

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
			[CONTENT_TYPE]: "application/json",
			[X_API_KEY]: adminToken,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new HttpClientError(
			(err as { error?: string }).error ?? "Unknown error",
			res.status
		);
	}
	return res.json() as Promise<TData>;
}
