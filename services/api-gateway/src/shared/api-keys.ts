/**
 * Scopes of an API key (ADR-0059): `read` for the GET routes of
 * `PUBLIC_ROUTES`, `dlq:write` for the others (delete, replay DLQ
 * entries).
 */
export const API_SCOPES = ["read", "dlq:write"] as const;
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

/** Scope a public route needs: `read` for GET, `dlq:write` otherwise. */
export function requiredScope(method: string): ApiScope {
	// Every non-GET public route is a DLQ write (public-routes.spec checks it).
	return method === "GET" ? "read" : "dlq:write";
}
