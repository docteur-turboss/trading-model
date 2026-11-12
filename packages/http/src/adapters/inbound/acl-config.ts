import { ServiceId } from "@trading-model/primitives/primitives";

/** Services that can call each other, named by their mTLS identity. */
export enum KnownService {
	DiscoveryServer = "discovery-server",
	AuditLogger = "audit-logger",
	MessageManager = "message-manager",
	FinancialScraper = "financial-scraper",
	TraderTrainer = "trader-trainer",
	ApiGateway = "api-gateway",
	DlqService = "dlq-service",
}

/** Default caller allowlist per target service; `*` admits any platform service. */
export const DEFAULT_ACL: Record<KnownService, readonly ServiceId[]> = {
	[KnownService.DiscoveryServer]: [ServiceId.of("*")],
	[KnownService.AuditLogger]: [ServiceId.of("*")],
	// Publishers, plus the subscribers: audit-logger subscribes to every topic
	// and dlq-service republishes replayed entries. Not api-gateway: it would
	// lend its identity to API clients (it proxies with its own SVID).
	[KnownService.MessageManager]: [
		ServiceId.of("discovery-server"),
		ServiceId.of("financial-scraper"),
		ServiceId.of("trader-trainer"),
		ServiceId.of("audit-logger"),
		ServiceId.of("dlq-service"),
	],
	// message-manager delivers subscribed topics to services that mount
	// MessageManagerListenExpress (POST /<MESSAGE_CALLBACK_PATH>).
	[KnownService.FinancialScraper]: [
		ServiceId.of("api-gateway"),
		ServiceId.of("message-manager"),
		// The data supply: the trainer reads its signals and market data (ADR-0036).
		ServiceId.of("trader-trainer"),
	],
	[KnownService.TraderTrainer]: [
		ServiceId.of("api-gateway"),
		ServiceId.of("financial-scraper"),
		ServiceId.of("discovery-server"),
		ServiceId.of("message-manager"),
	],
	// External traffic enters through the edge proxy (ADR-0018).
	[KnownService.ApiGateway]: [ServiceId.of("edge-proxy")],
	[KnownService.DlqService]: [ServiceId.of("*")],
};
