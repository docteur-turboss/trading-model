import { ServiceId } from "@trading-model/primitives/primitives";

/** Services that can call each other, named by their mTLS identity. */
export enum KnownService {
	DiscoveryServer = "discovery-server",
	AuditLogger = "audit-logger",
	FinancialScraper = "financial-scraper",
	TraderTrainer = "trader-trainer",
	ApiGateway = "api-gateway",
	RiskExecution = "risk-execution",
}

/** Default caller allowlist per target service; `*` admits any platform service. */
export const DEFAULT_ACL: Record<KnownService, readonly ServiceId[]> = {
	[KnownService.DiscoveryServer]: [ServiceId.of("*")],
	// api-gateway relays the public reads.
	[KnownService.AuditLogger]: [ServiceId.of("api-gateway")],
	[KnownService.FinancialScraper]: [
		ServiceId.of("api-gateway"),
		// The data supply: the trainer reads its signals and market data (ADR-0036).
		ServiceId.of("trader-trainer"),
		// The replay of a published model reads its candle window (ADR-0079).
		ServiceId.of("model-evaluator"),
	],
	[KnownService.TraderTrainer]: [
		ServiceId.of("api-gateway"),
		ServiceId.of("financial-scraper"),
		ServiceId.of("discovery-server"),
		// Offline evaluation of published models (ADR-0049): manifest and weights.
		ServiceId.of("model-evaluator"),
		// Risk/Execution reads the admission of the model an intent names (ADR-0064 §2).
		ServiceId.of("risk-execution"),
	],
	// External traffic enters through the edge proxy (ADR-0018).
	[KnownService.ApiGateway]: [ServiceId.of("edge-proxy")],
	// The operator reaches the admin routes from the pod, with the service's own SVID. Intents come from the decision consumer only (ADR-0064 §1): no entry until it exists (ADR-0049 §1.3).
	[KnownService.RiskExecution]: [ServiceId.of("risk-execution")],
};
