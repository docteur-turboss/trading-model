import type { HttpClient } from "@trading-model/common/config/http-client";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";

export interface DiscoveryDeps {
	httpClient: HttpClient;
	serviceCache: IServiceCache;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}
