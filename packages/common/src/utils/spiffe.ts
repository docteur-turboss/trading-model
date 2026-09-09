import {
	isSpiffeId,
	normalizeServiceName,
	parseSpiffeId,
	serviceNameFromSpiffeId,
} from "../config/workload-identity";
import { ServiceId } from "../domain/primitives";

export type {
	ParsedSpiffeId,
	PlatformService,
} from "../config/workload-identity";
export {
	buildSpiffeId,
	DEFAULT_NAMESPACE,
	isPlatformService,
	isSpiffeId,
	LEGACY_SERVICE_NAME_ALIASES,
	normalizeServiceName,
	PLATFORM_SERVICE_IDS,
	PLATFORM_SERVICES,
	parseSpiffeId,
	SPIFFE_PATH_SEGMENT_NAMESPACE,
	SPIFFE_PATH_SEGMENT_SERVICE_ACCOUNT,
	SPIFFE_URI_SCHEME,
	serviceNameFromSpiffeId,
	TRUST_DOMAIN,
} from "../config/workload-identity";

/**
 * Maps a raw client identity (from an mTLS peer certificate SAN/CN) to a
 * logical {@link ServiceId}.
 *
 *  - `spiffe://...` → the canonical service name (last SPIFFE path segment)
 *  - `client:<token-prefix>` → the API gateway (external callers)
 *  - anything else → used verbatim (legacy CN/DNS identities)
 */
export function extractServiceName(clientIdentity: string): ServiceId | null {
	if (isSpiffeId(clientIdentity)) {
		return serviceNameFromSpiffeId(clientIdentity);
	}
	if (clientIdentity.startsWith("client:")) {
		return ServiceId.of("api-gateway");
	}
	return clientIdentity ? ServiceId.of(clientIdentity) : null;
}

/**
 * Like {@link extractServiceName} but normalizes legacy registration names
 * onto their canonical SPIFFE service name.
 */
export function extractCanonicalServiceName(
	clientIdentity: string
): ServiceId | null {
	if (isSpiffeId(clientIdentity)) {
		return serviceNameFromSpiffeId(clientIdentity);
	}
	if (clientIdentity.startsWith("client:")) {
		return ServiceId.of("api-gateway");
	}
	return clientIdentity ? normalizeServiceName(clientIdentity) : null;
}

export type { ParsedSpiffeId as SpiffeIdentity } from "../config/workload-identity";
export { parseSpiffeId as parseSpiffeIdentity };
