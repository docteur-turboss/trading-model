import type { ServiceId } from "../domain/primitives";

function toServiceId(serviceName: string): ServiceId {
	return serviceName as ServiceId;
}

export const DEFAULT_ACL: Record<string, readonly ServiceId[]> = {
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
