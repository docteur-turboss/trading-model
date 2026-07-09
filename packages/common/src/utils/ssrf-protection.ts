import { isIP } from "node:net";

const BLOCKED_IPV4_PREFIXES = ["127.", "10.", "0.", "169.254.", "192.168."];
const BLOCKED_IPV6 = ["::1", "::ffff:127.", "fe80:", "fc00:", "fd00:"];

/** Hostnames that are always allowed regardless of DNS resolution. */
const ALLOWED_HOSTNAMES = new Set<string>(["localhost"]);

/**
 * Validates that a hostname or IP is safe for outgoing HTTP requests.
 * Blocks internal/reserved IPs to prevent SSRF (Server-Side Request Forgery).
 *
 * @returns true if the address is safe, false if it resolves to an internal IP
 */
function _matchesAnyPrefix(
	value: string,
	prefixes: string[],
	normalize?: (str: string) => string
): boolean {
	const normalized = normalize ? normalize(value) : value;
	for (const prefix of prefixes) {
		if (normalized.startsWith(prefix)) {
			return true;
		}
	}
	return false;
}

export function isInternalAddress(hostname: string): boolean {
	if (!hostname) {
		return true;
	}
	if (ALLOWED_HOSTNAMES.has(hostname)) {
		return false;
	}
	if (isIP(hostname) === 4) {
		return _matchesAnyPrefix(hostname, BLOCKED_IPV4_PREFIXES);
	}
	if (isIP(hostname) === 6) {
		return _matchesAnyPrefix(hostname, BLOCKED_IPV6, (str) =>
			str.toLowerCase()
		);
	}
	return false;
}

/**
 * Blocks SSRF by throwing if the hostname resolves to an internal address.
 * Use BEFORE making an HTTP request to an untrusted target.
 */
export function assertNotInternalAddress(hostname: string): void {
	if (isInternalAddress(hostname)) {
		throw new Error(
			`SSRF blocked: internal address ${hostname} is not allowed`
		);
	}
}
