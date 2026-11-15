/** Well-known service instance identifiers used across the system. */
export enum ServiceInstanceName {
	ApiGatewayService = "api-gateway",
	AuditLoggerService = "audit-logger",
	DiscoveryService = "discovery-server",
	DlqService = "dlq-service",
	FinancialScraperService = "financial-scraper",
	MessageManagerService = "message-manager",
	ModelEvaluatorService = "model-evaluator",
	TraderTrainerService = "trader-trainer",
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
