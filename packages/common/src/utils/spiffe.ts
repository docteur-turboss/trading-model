export type {
	ParsedSpiffeId,
	ParsedSpiffeId as SpiffeIdentity,
	PlatformService,
} from "../config/workload-identity";
export {
	buildSpiffeId,
	DEFAULT_NAMESPACE,
	extractCanonicalServiceName,
	extractServiceName,
	isPlatformService,
	isSpiffeId,
	LEGACY_SERVICE_NAME_ALIASES,
	normalizeServiceName,
	PLATFORM_SERVICE_IDS,
	PLATFORM_SERVICES,
	parseSpiffeId,
	parseSpiffeId as parseSpiffeIdentity,
	SPIFFE_PATH_SEGMENT_NAMESPACE,
	SPIFFE_PATH_SEGMENT_SERVICE_ACCOUNT,
	SPIFFE_URI_SCHEME,
	serviceNameFromSpiffeId,
	TRUST_DOMAIN,
} from "../config/workload-identity";
