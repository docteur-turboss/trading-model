import { ServiceId } from "../domain/primitives";

type KnownService =
	| "certificate-authority"
	| "discovery-server"
	| "audit-logger"
	| "message-manager"
	| "financial-scraper"
	| "trader-trainer"
	| "api-gateway";

function toServiceId(serviceName: string): ServiceId {
	return ServiceId.of(serviceName);
}

export const DEFAULT_ACL: Record<KnownService, readonly ServiceId[]> = {
	"certificate-authority": [toServiceId("*")],
	"discovery-server": [toServiceId("*")],
	"audit-logger": [toServiceId("*")],
	"message-manager": [
		toServiceId("discovery-server"),
		toServiceId("financial-scraper"),
		toServiceId("trader-trainer"),
		toServiceId("api-gateway"),
	],
	"financial-scraper": [toServiceId("api-gateway")],
	"trader-trainer": [
		toServiceId("api-gateway"),
		toServiceId("financial-scraper"),
		toServiceId("discovery-server"),
	],
	"api-gateway": [toServiceId("admin-interface")],
};
