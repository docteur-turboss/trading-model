/**
 * Scopes of an API key (ADR-0059): `read` for the GET routes of
 * `PUBLIC_ROUTES`, `dlq:write` for the other DLQ routes (delete, replay),
 * `risk:admin` for the risk-execution kill switch (engage, re-arm).
 */
const API_SCOPES = ["read", "dlq:write", "risk:admin"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** A key of `AUTH_TOKENS`. Only `name` leaves the gateway, never `secret`. */
export interface ApiKey {
	name: string;
	scopes: readonly ApiScope[];
	secret: string;
}

const NAME = /^[A-Za-z0-9._-]{1,64}$/;

const isScope = (scope: string): scope is ApiScope =>
	(API_SCOPES as readonly string[]).includes(scope);

/**
 * Parses one entry of `AUTH_TOKENS`: `name:scope1+scope2:secret`, the secret
 * after the last `:` (a scope such as `dlq:write` holds one too). * Returns the reason when the entry is invalid; the reason never quotes the
 * secret.
 */
export function parseApiKey(entry: string): ApiKey | { error: string } {
	if (!entry.includes(":")) {
		return { error: "entry must be name:scopes:secret (bare secret refused)" };
	}
	const first = entry.indexOf(":");
	const last = entry.lastIndexOf(":");
	const name = entry.slice(0, first);
	const scopes = first === last ? [] : entry.slice(first + 1, last).split("+");
	const secret = entry.slice(last + 1);
	if (!NAME.test(name)) {
		return { error: "key name must match [A-Za-z0-9._-]{1,64}" };
	}
	if (scopes.length === 0 || !scopes.every(isScope)) {
		return {
			error: `key "${name}": scopes must be among ${API_SCOPES.join(", ")}, joined by +`,
		};
	}
	if (!secret) {
		return { error: `key "${name}": empty secret` };
	}
	return { name, scopes, secret };
}

/** Scope a public route needs: `read` for GET, `risk:admin` for risk-execution, `dlq:write` otherwise. */
export function requiredScope(method: string, pattern = ""): ApiScope {
	if (method === "GET") {
		return "read";
	}
	// Every other non-GET public route is a DLQ write (api-keys.spec checks it).
	return pattern.includes("/risk-execution/") ? "risk:admin" : "dlq:write";
}
