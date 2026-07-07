import type { ConfigEntry, ServiceRegistry, StatsSummary } from "../types/dtos";
import { request } from "./_request";

export const discoveryApi = {
	getServices: () => request<ServiceRegistry>("GET", "/discovery/registry"),
	banInstance: (name: string, id: string) =>
		request<void>("DELETE", `/discovery/services/${name}/instances/${id}`),

	getConfig: (service?: string) =>
		request<ConfigEntry[]>(
			"GET",
			`/discovery/config${service ? `/${service}` : ""}`
		),

	getStats: () => request<StatsSummary>("GET", "/discovery/stats"),
};
