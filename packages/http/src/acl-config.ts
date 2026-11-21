import { ServiceId } from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";

/** Default caller allowlist per target service; `*` admits any platform service. */
export const DEFAULT_ACL: Record<ServiceInstanceName, readonly ServiceId[]> = {
	[ServiceInstanceName.DiscoveryService]: [ServiceId.of("*")],
	// api-gateway relays the public reads.
	[ServiceInstanceName.AuditLoggerService]: [ServiceId.of("api-gateway")],
	[ServiceInstanceName.FinancialScraperService]: [
		ServiceId.of("api-gateway"),
		// The data supply: the trainer reads its signals and market data (ADR-0036).
		ServiceId.of("trader-trainer"),
		// The replay of a published model reads its candle window (ADR-0079).
		ServiceId.of("model-evaluator"),
	],
	[ServiceInstanceName.TraderTrainerService]: [
		ServiceId.of("api-gateway"),
		ServiceId.of("financial-scraper"),
		ServiceId.of("discovery-server"),
		// Offline evaluation of published models (ADR-0049): manifest and weights.
		ServiceId.of("model-evaluator"),
		// Risk/Execution reads the admission of the model an intent names (ADR-0064 §2).
		ServiceId.of("risk-execution"),
	],
	// External traffic enters through the edge proxy (ADR-0018).
	[ServiceInstanceName.ApiGatewayService]: [ServiceId.of("edge-proxy")],
	// No caller: it reads training.model.published from the bus in process (ADR-0073).
	[ServiceInstanceName.ModelEvaluatorService]: [],
	// The operator reaches the admin routes from the pod, with the service's own SVID. Intents come from the decision consumer only (ADR-0064 §1): no entry until it exists (ADR-0049 §1.3).
	[ServiceInstanceName.RiskExecutionService]: [ServiceId.of("risk-execution")],
};
