/** Well-known service instance identifiers used across the system. */
export enum ServiceInstanceName {
	ApiGatewayService = "api-gateway",
	AuditLoggerService = "audit-logger",
	DecisionConsumerService = "decision-consumer",
	DlqService = "dlq-service",
	FinancialScraperService = "financial-scraper",
	MessageManagerService = "message-manager",
	ModelEvaluatorService = "model-evaluator",
	RiskExecutionService = "risk-execution",
	TraderTrainerService = "trader-trainer",
}

const CORE_SERVICE_NAMES = new Set<ServiceInstanceName>(
	Object.values(ServiceInstanceName)
);

export const ALL_SERVICE_NAMES: ReadonlySet<ServiceInstanceName> =
	CORE_SERVICE_NAMES;

export function parseServiceName(value: string): ServiceInstanceName {
	if (!CORE_SERVICE_NAMES.has(value as ServiceInstanceName)) {
		throw new Error(
			`Invalid ServiceInstanceName: "${value}". Must be one of: ${Array.from(CORE_SERVICE_NAMES).join(", ")}`
		);
	}
	return value as ServiceInstanceName;
}
