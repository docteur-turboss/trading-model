import { ServiceId } from "@trading-model/primitives/primitives/general-ids";

/**
 * SPIFFE workload identity primitives (ADR-0011).
 *
 * Single source of truth for the platform's SPIFFE trust domain, SPIFFE ID
 * scheme, and canonical service identities. All service workloads are issued
 * SVIDs whose SPIFFE ID is bound to their canonical service name; only this shape from our trust domain is accepted as a caller identity (no CN fallback):
 *
 *   spiffe://<TRUST_DOMAIN>/ns/<namespace>/sa/<service>
 */

export const TRUST_DOMAIN = "trading-model.local" as const;

/** Namespace embedded in platform SPIFFE IDs when none is supplied. */
export const DEFAULT_NAMESPACE = "trading-model" as const;

export const SPIFFE_URI_SCHEME = "spiffe://" as const;
export const SPIFFE_PATH_SEGMENT_NAMESPACE = "ns" as const;
export const SPIFFE_PATH_SEGMENT_SERVICE_ACCOUNT = "sa" as const;

/** Canonical, SPIFFE-issued service identities (last SPIFFE path segment). */
export const PLATFORM_SERVICES = [
	"api-gateway",
	"audit-logger",
	"decision-consumer",
	"edge-proxy",
	"financial-scraper",
	"model-evaluator",
	"risk-execution",
	"trader-trainer",
] as const;

/**
 * Aliases still emitted by legacy compose registration names so the
 * identity layer can map them onto their canonical SPIFFE service name during
 * the ADR-0011 migration.
 */
export const LEGACY_SERVICE_NAME_ALIASES: Readonly<Record<string, string>> = {
	"audit-logger-service": "audit-logger",
	"financial-scraper-service": "financial-scraper",
	"trader-training-service": "trader-trainer",
};

/**
 * Normalizes a raw service identity segment onto the canonical SPIFFE service
 * name (applies legacy aliases). Unknown names pass through unchanged.
 */
export function normalizeServiceName(service: string | ServiceId): ServiceId {
	const raw = String(service);
	return ServiceId.of(LEGACY_SERVICE_NAME_ALIASES[raw] ?? raw);
}

/** True when the identity string is a syntactically valid SPIFFE ID. */
export function isSpiffeId(identity: string): boolean {
	return parseSpiffeId(identity) !== null;
}

export interface ParsedSpiffeId {
	/** e.g. "trading-model.local" */
	trustDomain: string;
	/** Namespace segment when the ID follows /ns/<namespace>/sa/<service>. */
	namespace?: string;
	/** Service account segment when the ID follows the platform scheme. */
	serviceAccount?: string;
	/** Canonical service identity = last path segment. */
	serviceName: ServiceId;
	/** The raw SPIFFE ID. */
	raw: string;
}

/**
 * Parses a SPIFFE ID (any path shape) into its components. Returns null for
 * anything that is not a valid SPIFFE ID.
 */
export function parseSpiffeId(identity: string): ParsedSpiffeId | null {
	if (typeof identity !== "string" || identity.length === 0) {
		return null;
	}
	if (!identity.startsWith(SPIFFE_URI_SCHEME)) {
		return null;
	}
	const [trustDomain, ...path] = identity
		.slice(SPIFFE_URI_SCHEME.length)
		.split("/")
		.filter((segment) => segment.length > 0);
	if (trustDomain === undefined) {
		return null;
	}
	const parsed: ParsedSpiffeId = {
		trustDomain,
		serviceName: normalizeServiceName(path[path.length - 1] ?? ""),
		raw: identity,
	};
	if (
		path.length === 4 &&
		path[0] === SPIFFE_PATH_SEGMENT_NAMESPACE &&
		path[2] === SPIFFE_PATH_SEGMENT_SERVICE_ACCOUNT
	) {
		parsed.namespace = path[1];
		parsed.serviceAccount = path[path.length - 1];
	}
	return parsed;
}

/** Extracts the canonical service name from a SPIFFE ID, or null. */
export function serviceNameFromSpiffeId(identity: string): ServiceId | null {
	return parseSpiffeId(identity)?.serviceName ?? null;
}

/**
 * Maps a peer certificate identity (a SPIFFE ID, alone or inside a SAN list
 * such as `DNS:x, URI:spiffe://...`) to its canonical {@link ServiceId}.
 * Only `spiffe://<TRUST_DOMAIN>/ns/<namespace>/sa/<service>` is accepted, in
 * `namespace` when given; anything else (other trust domain or path, no SPIFFE
 * ID, CN, `client:*`) gives null.
 */
export function extractCanonicalServiceName(
	clientIdentity: string,
	namespace?: string
): ServiceId | null {
	const spiffeId = _findSpiffeId(clientIdentity);
	const parsed = spiffeId ? parseSpiffeId(spiffeId) : null;
	if (
		!parsed ||
		parsed.trustDomain !== TRUST_DOMAIN ||
		parsed.namespace === undefined ||
		(namespace !== undefined && parsed.namespace !== namespace)
	) {
		return null;
	}
	return parsed.serviceName;
}

/** The SPIFFE ID in a raw identity: the identity itself, or the URI entry of a SAN list. */
function _findSpiffeId(clientIdentity: string): string | null {
	if (isSpiffeId(clientIdentity)) {
		return clientIdentity;
	}
	const candidate = clientIdentity.match(/spiffe:\/\/[^\s,]+/)?.[0];
	return candidate && isSpiffeId(candidate) ? candidate : null;
}
