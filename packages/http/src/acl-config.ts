import { ServiceId } from "@trading-model/primitives/primitives";

/** Services that can call each other, named by their mTLS identity. */
export enum KnownService {
	DiscoveryServer = "discovery-server",
	AuditLogger = "audit-logger",
	FinancialScraper = "financial-scraper",
	TraderTrainer = "trader-trainer",
	ApiGateway = "api-gateway",
}

/** Default caller allowlist per target service; `*` admits any platform service. */
export const DEFAULT_ACL: Record<KnownService, readonly ServiceId[]> = {
	[KnownService.DiscoveryServer]: [ServiceId.of("*")],
	[KnownService.AuditLogger]: [ServiceId.of("*")],
	[KnownService.FinancialScraper]: [
		ServiceId.of("api-gateway"),
		// The data supply: the trainer reads its signals and market data (ADR-0036).
		ServiceId.of("trader-trainer"),
	],
	[KnownService.TraderTrainer]: [
		ServiceId.of("api-gateway"),
		ServiceId.of("financial-scraper"),
		ServiceId.of("discovery-server"),
		// Offline evaluation of published models (ADR-0049): manifest and weights.
		ServiceId.of("model-evaluator"),
	],
	// External traffic enters through the edge proxy (ADR-0018).
	[KnownService.ApiGateway]: [ServiceId.of("edge-proxy")],
};
