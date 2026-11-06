/** Well-known service instance identifiers used across the system. */
export enum ServiceInstanceName {
	ApiGatewayService = "api-gateway",
	AuditLoggerService = "audit-logger",
	DiscoveryService = "discovery-server",
	DlqService = "dlq-service",
	FinancialScraperService = "financial-scraper",
	MessageManagerService = "message-manager",
	TraderTrainerService = "trader-trainer",
	/** @deprecated release N transition: old registry name, removed in N+1 (issue #495). */
	LegacyAuditLoggerService = "audit-logger-service",
	/** @deprecated see LegacyAuditLoggerService. */
	LegacyDiscoveryService = "discovery-service",
	/** @deprecated see LegacyAuditLoggerService. */
	LegacyFinancialScraperService = "financial-scraper-service",
	/** @deprecated see LegacyAuditLoggerService. */
	LegacyMessageDeliveryService = "message-delivery-service",
}

const CORE_SERVICE_NAMES = new Set<ServiceInstanceName>(
	Object.values(ServiceInstanceName)
);
const EXTRA_SERVICE_NAMES = new Set<ServiceInstanceName>();

export const ALL_SERVICE_NAMES: ReadonlySet<ServiceInstanceName> =
	CORE_SERVICE_NAMES;

export function registerServiceName(name: ServiceInstanceName): void {
	EXTRA_SERVICE_NAMES.add(name);
}

export function parseServiceName(value: string): ServiceInstanceName {
	if (
		!(
			CORE_SERVICE_NAMES.has(value as ServiceInstanceName) ||
			EXTRA_SERVICE_NAMES.has(value as ServiceInstanceName)
		)
	) {
		throw new Error(
			`Invalid ServiceInstanceName: "${value}". Must be one of: ${Array.from(CORE_SERVICE_NAMES).join(", ")}`
		);
	}
	return value as ServiceInstanceName;
}
