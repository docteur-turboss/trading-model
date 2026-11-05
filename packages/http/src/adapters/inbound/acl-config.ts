import { ServiceId } from "@trading-model/primitives/primitives";

export enum KnownService {
	DiscoveryServer = "discovery-server",
	AuditLogger = "audit-logger",
	MessageManager = "message-manager",
	FinancialScraper = "financial-scraper",
	TraderTrainer = "trader-trainer",
	ApiGateway = "api-gateway",
	DlqService = "dlq-service",
}

function toServiceId(serviceName: string): ServiceId {
	return ServiceId.of(serviceName);
}

export const DEFAULT_ACL: Record<KnownService, readonly ServiceId[]> = {
	[KnownService.DiscoveryServer]: [toServiceId("*")],
	[KnownService.AuditLogger]: [toServiceId("*")],
	// Publishers, plus the subscribers: audit-logger subscribes to every topic
	// and dlq-service republishes replayed entries. Not api-gateway: it would
	// lend its identity to API clients (it proxies with its own SVID).
	[KnownService.MessageManager]: [
		toServiceId("discovery-server"),
		toServiceId("financial-scraper"),
		toServiceId("trader-trainer"),
		toServiceId("audit-logger"),
		toServiceId("dlq-service"),
	],
	// message-manager delivers subscribed topics to services that mount
	// MessageManagerListenExpress (POST /<MESSAGE_CALLBACK_PATH>).
	[KnownService.FinancialScraper]: [
		toServiceId("api-gateway"),
		toServiceId("message-manager"),
		// The data supply: the trainer reads its signals and market data (ADR-0036).
		toServiceId("trader-trainer"),
	],
	[KnownService.TraderTrainer]: [
		toServiceId("api-gateway"),
		toServiceId("financial-scraper"),
		toServiceId("discovery-server"),
		toServiceId("message-manager"),
	],
	// External traffic enters through the edge proxy (ADR-0018).
	[KnownService.ApiGateway]: [toServiceId("edge-proxy")],
	[KnownService.DlqService]: [toServiceId("*")],
};
