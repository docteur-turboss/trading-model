/**
 * Scopes of an API key (ADR-0059): `read` for the GET routes of
 * `PUBLIC_ROUTES`, `risk:admin` for the risk-execution kill switch (engage, re-arm).
 */
const API_SCOPES = ["read", "risk:admin"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Scope of the retired DLQ routes (#1241): accepted then ignored for one release so
 * that the N-1 AUTH_TOKENS still start the gateway (expand/contract, ADR-0040).
 */
const RETIRED_SCOPE = "dlq:write";

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
 * after the last `:` (a scope may hold one too). Returns the reason when the entry is invalid; the reason never quotes the
 * secret.
 */
export function parseApiKey(entry: string): ApiKey | { error: string } {
	if (!entry.includes(":")) {
		return { error: "entry must be name:scopes:secret (bare secret refused)" };
	}
	const first = entry.indexOf(":");
	const last = entry.lastIndexOf(":");
	const name = entry.slice(0, first);
	const declared =
		first === last ? [] : entry.slice(first + 1, last).split("+");
	const scopes = declared.filter((scope) => scope !== RETIRED_SCOPE);
	const secret = entry.slice(last + 1);
	if (!NAME.test(name)) {
		return { error: "key name must match [A-Za-z0-9._-]{1,64}" };
	}
	if (declared.length === 0 || !scopes.every(isScope)) {
		return {
			error: `key "${name}": scopes must be among ${API_SCOPES.join(", ")}, joined by +`,
		};
	}
	if (!secret) {
		return { error: `key "${name}": empty secret` };
	}
	return { name, scopes, secret };
}

/** Whether a key of AUTH_TOKENS still declares the retired scope (startup warning). */
export function hasRetiredScope(entries: readonly string[]): boolean {
	return entries.some((entry) =>
		entry
			.slice(entry.indexOf(":") + 1, entry.lastIndexOf(":"))
			.split("+")
			.includes(RETIRED_SCOPE)
	);
}

/** Scope a public route needs: `read` for GET, `risk:admin` otherwise (the kill switch is the only public write). */
export function requiredScope(method: string): ApiScope {
	return method === "GET" ? "read" : "risk:admin";
}
