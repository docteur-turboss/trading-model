import { ServiceId } from "@trading-model/primitives/primitives";

/** Services that can call each other, named by their mTLS identity. */
export enum KnownService {
	AuditLogger = "audit-logger",
	MessageManager = "message-manager",
	FinancialScraper = "financial-scraper",
	TraderTrainer = "trader-trainer",
	ApiGateway = "api-gateway",
	DlqService = "dlq-service",
	ModelEvaluator = "model-evaluator",
	RiskExecution = "risk-execution",
}

/** Default caller allowlist per target service; `*` admits any platform service. */
export const DEFAULT_ACL: Record<KnownService, readonly ServiceId[]> = {
	// message-manager delivers audited topics; api-gateway relays the public reads.
	[KnownService.AuditLogger]: [
		ServiceId.of("message-manager"),
		ServiceId.of("api-gateway"),
	],
	// Publishers, plus the subscribers: audit-logger subscribes to its topics
	// and dlq-service republishes replayed entries. Not api-gateway: it would
	// lend its identity to API clients (it proxies with its own SVID).
	[KnownService.MessageManager]: [
		ServiceId.of("financial-scraper"),
		ServiceId.of("trader-trainer"),
		ServiceId.of("audit-logger"),
		ServiceId.of("dlq-service"),
		ServiceId.of("model-evaluator"),
	],
	// message-manager delivers subscribed topics to services that mount
	// MessageManagerListenExpress (POST /<MESSAGE_CALLBACK_PATH>).
	[KnownService.FinancialScraper]: [
		ServiceId.of("api-gateway"),
		ServiceId.of("message-manager"),
		// The data supply: the trainer reads its signals and market data (ADR-0036).
		ServiceId.of("trader-trainer"),
		// The replay of a published model reads its candle window (ADR-0079).
		ServiceId.of("model-evaluator"),
	],
	[KnownService.TraderTrainer]: [
		ServiceId.of("api-gateway"),
		ServiceId.of("financial-scraper"),
		ServiceId.of("message-manager"),
		// Offline evaluation of published models (ADR-0049): manifest and weights.
		ServiceId.of("model-evaluator"),
		// Risk/Execution reads the admission of the model an intent names (ADR-0064 §2).
		ServiceId.of("risk-execution"),
	],
	// External traffic enters through the edge proxy (ADR-0018).
	[KnownService.ApiGateway]: [ServiceId.of("edge-proxy")],
	// api-gateway relays the public DLQ routes; no other caller found.
	[KnownService.DlqService]: [ServiceId.of("api-gateway")],
	// message-manager delivers training.model.published (POST /message).
	[KnownService.ModelEvaluator]: [ServiceId.of("message-manager")],
	// The operator reaches the admin routes from the pod, with the service's own SVID. Intents come from the decision consumer only (ADR-0064 §1): no entry until it exists (ADR-0049 §1.3).
	[KnownService.RiskExecution]: [ServiceId.of("risk-execution")],
};
