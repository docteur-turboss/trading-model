import { ServiceId } from "../domain/primitives/general-ids";

/**
 * SPIFFE workload identity primitives (ADR-0011).
 *
 * Single source of truth for the platform's SPIFFE trust domain, SPIFFE ID
 * scheme, and canonical service identities. All service workloads are issued
 * SVIDs whose SPIFFE ID ends with their canonical service name:
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
	"admin-interface",
	"api-gateway",
	"audit-logger",
	"discovery-server",
	"dlq-service",
	"financial-scraper",
	"message-manager",
	"trader-trainer",
] as const;

export type PlatformService = (typeof PLATFORM_SERVICES)[number];

export const PLATFORM_SERVICE_IDS: ReadonlySet<ServiceId> = new Set(
	PLATFORM_SERVICES.map((name) => ServiceId.of(name))
);

/**
 * Aliases still emitted by legacy discovery/compose registration names so the
 * identity layer can map them onto their canonical SPIFFE service name during
 * the ADR-0011 migration.
 */
export const LEGACY_SERVICE_NAME_ALIASES: Readonly<Record<string, string>> = {
	"audit-logger-service": "audit-logger",
	"discovery-service": "discovery-server",
	"financial-scraper-service": "financial-scraper",
	"financial-scrapper-service": "financial-scraper",
	"message-delivery-service": "message-manager",
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

export function isPlatformService(service: string | ServiceId): boolean {
	return PLATFORM_SERVICE_IDS.has(ServiceId.of(String(service)));
}

/** True when the identity string is a syntactically valid SPIFFE ID. */
export function isSpiffeId(identity: string): boolean {
	return (
		identity.startsWith(SPIFFE_URI_SCHEME) && parseSpiffeId(identity) !== null
	);
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

/** Builds a platform SPIFFE ID for the given service and namespace. */
export function buildSpiffeId(
	service: string | ServiceId,
	namespace: string = DEFAULT_NAMESPACE
): string {
	const name = normalizeServiceName(service);
	return [
		SPIFFE_URI_SCHEME + TRUST_DOMAIN,
		SPIFFE_PATH_SEGMENT_NAMESPACE,
		namespace,
		SPIFFE_PATH_SEGMENT_SERVICE_ACCOUNT,
		String(name),
	].join("/");
}

/**
 * Parses a SPIFFE ID (any path shape) into its components. Returns null for
 * anything that is not a valid SPIFFE ID.
 */
export function parseSpiffeId(identity: string): ParsedSpiffeId | null {
	if (typeof identity !== "string" || identity.length === 0) {
		return null;
	}
	const scheme = SPIFFE_URI_SCHEME;
	if (!identity.startsWith(scheme)) {
		return null;
	}
	const rest = identity.slice(scheme.length);
	const segments = rest.split("/").filter((segment) => segment.length > 0);
	if (segments.length === 0) {
		return null;
	}
	const [trustDomain, ...path] = segments;
	if (trustDomain === undefined || trustDomain.length === 0) {
		return null;
	}
	const parsed: ParsedSpiffeId = {
		trustDomain,
		serviceName: normalizeServiceName(path[path.length - 1] ?? ""),
		raw: identity,
	};
	if (
		path.length >= 3 &&
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
	const parsed = parseSpiffeId(identity);
	return parsed?.serviceName ?? null;
}
