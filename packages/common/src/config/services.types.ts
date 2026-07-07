/** Well-known service instance identifiers used across the system. */
export enum ServiceInstanceName {
	ApiGatewayService = "api-gateway-service",
	AuditLoggerService = "audit-logger-service",
	CertificateAuthorityService = "certificate-authority-service",
	CoreBalancerService = "core-balancer-service",
	DiscoveryService = "discovery-service",
	FinancialScraperService = "financial-scraper-service",
	JobSchedulerService = "job-scheduler-service",
	MessageDeliveryService = "message-delivery-service",
	OfficialDataScraperService = "official-data-scraper-service",
	OnlineScraperService = "online-scraper-service",
	PredictPriceService = "predict-price-service",
	RiskAnalysisService = "risk-analysis-service",
	TraderTrainingService = "trader-training-service",
}

const ALL_SERVICE_NAMES = new Set<string>(Object.values(ServiceInstanceName));

export function parseServiceName(value: string): ServiceInstanceName {
	if (!ALL_SERVICE_NAMES.has(value)) {
		throw new Error(
			`Invalid ServiceInstanceName: "${value}". Must be one of: ${Array.from(ALL_SERVICE_NAMES).join(", ")}`
		);
	}
	return value as ServiceInstanceName;
}
