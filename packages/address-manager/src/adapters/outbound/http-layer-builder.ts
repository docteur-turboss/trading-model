import { HttpClient } from "@trading-model/common/config/http-client";
import { TokenManager } from "../../application/client/token-manager";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";
import { AddressManagerClient } from "./client/address-manager-client";
import { RedisServiceCache } from "./discovery/redis-service-cache";
import { ServiceCache } from "./discovery/service-cache";

export interface HttpLayer {
	httpClient: HttpClient;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	serviceCache: IServiceCache;
}

export function buildHttpLayer(config: AddressManagerConfig): HttpLayer {
	const httpClient = HttpClient.createWithTls(config.pems ?? config.tls);
	const tokenManager = new TokenManager(httpClient, config);
	const addressManagerClient = new AddressManagerClient(
		httpClient,
		tokenManager,
		config
	);
	const serviceCache = createServiceCache(config);
	return { httpClient, tokenManager, addressManagerClient, serviceCache };
}

function createServiceCache(config: AddressManagerConfig): IServiceCache {
	return config.redisCacheUrl
		? new RedisServiceCache({
				redisUrl: config.redisCacheUrl,
				prefix: "discovery:cache:",
				ttlMs: config.cacheTtlMs,
				cacheOptions: config.redisCacheOptions,
			})
		: new ServiceCache(config.cacheTtlMs);
}
