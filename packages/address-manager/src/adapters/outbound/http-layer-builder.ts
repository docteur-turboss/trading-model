import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { TokenManager } from "../../application/client/token-manager";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";
import { AddressManagerClient } from "./client/address-manager-client";
import { ServiceCache } from "./discovery/service-cache";

export interface HttpLayer {
	httpClient: HttpClient;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	serviceCache: IServiceCache;
}

export function buildHttpLayer(config: AddressManagerConfig): HttpLayer {
	const httpClient = HttpClient.createWithTls(config.tls);
	const tokenManager = new TokenManager(httpClient, config);
	const addressManagerClient = new AddressManagerClient(
		httpClient,
		tokenManager,
		config
	);
	const serviceCache = new ServiceCache(config.cacheTtlMs);
	return { httpClient, tokenManager, addressManagerClient, serviceCache };
}
