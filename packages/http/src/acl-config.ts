import { ServiceId } from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";

/** Default caller allowlist per target service; `*` admits any platform service. */
export const DEFAULT_ACL: Record<ServiceInstanceName, readonly ServiceId[]> = {
	[ServiceInstanceName.DiscoveryService]: [ServiceId.of("*")],
	// message-manager delivers audited topics; api-gateway relays the public reads.
	[ServiceInstanceName.AuditLoggerService]: [
		ServiceId.of("message-manager"),
		ServiceId.of("api-gateway"),
	],
	// Publishers, plus the subscribers: audit-logger subscribes to its topics
	// and dlq-service republishes replayed entries. Not api-gateway: it would
	// lend its identity to API clients (it proxies with its own SVID).
	[ServiceInstanceName.MessageManagerService]: [
		ServiceId.of("discovery-server"),
		ServiceId.of("financial-scraper"),
		ServiceId.of("trader-trainer"),
		ServiceId.of("audit-logger"),
		ServiceId.of("dlq-service"),
		ServiceId.of("model-evaluator"),
		// Order and kill switch events for the audit chain (ADR-0064 §3).
		ServiceId.of("risk-execution"),
	],
	[ServiceInstanceName.FinancialScraperService]: [
		ServiceId.of("api-gateway"),
		// The data supply: the trainer reads its signals and market data (ADR-0036).
		ServiceId.of("trader-trainer"),
		// The replay of a published model reads its candle window (ADR-0079).
		ServiceId.of("model-evaluator"),
		// Risk/Execution marks its positions on the last closed candle (ADR-0064 §7).
		ServiceId.of("risk-execution"),
	],
	[ServiceInstanceName.TraderTrainerService]: [
		ServiceId.of("api-gateway"),
		// Offline evaluation of published models (ADR-0049): manifest and weights.
		ServiceId.of("model-evaluator"),
		// Risk/Execution reads the admission of the model an intent names (ADR-0064 §2).
		ServiceId.of("risk-execution"),
	],
	// External traffic enters through the edge proxy (ADR-0018).
	[ServiceInstanceName.ApiGatewayService]: [ServiceId.of("edge-proxy")],
	// api-gateway relays the public DLQ routes; no other caller found.
	[ServiceInstanceName.DlqService]: [ServiceId.of("api-gateway")],
	// message-manager delivers training.model.published (POST /message).
	[ServiceInstanceName.ModelEvaluatorService]: [
		ServiceId.of("message-manager"),
	],
	// The operator reaches the admin routes from the pod, with the service's own SVID. Intents come from the decision consumer only (ADR-0064 §1): no entry until it exists (ADR-0049 §1.3).
	[ServiceInstanceName.RiskExecutionService]: [ServiceId.of("risk-execution")],
};
