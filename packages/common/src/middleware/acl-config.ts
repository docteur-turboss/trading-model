import { ServiceId } from "../domain/primitives";

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
	[KnownService.MessageManager]: [
		toServiceId("discovery-server"),
		toServiceId("financial-scraper"),
		toServiceId("trader-trainer"),
		toServiceId("api-gateway"),
	],
	[KnownService.FinancialScraper]: [toServiceId("api-gateway")],
	[KnownService.TraderTrainer]: [
		toServiceId("api-gateway"),
		toServiceId("financial-scraper"),
		toServiceId("discovery-server"),
	],
	[KnownService.ApiGateway]: [toServiceId("admin-interface")],
	[KnownService.DlqService]: [toServiceId("*")],
};
