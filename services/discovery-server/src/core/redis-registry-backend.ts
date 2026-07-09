import { randomBytes } from "node:crypto";
import type { RedisConnectionConfig } from "@trading-model/common/config/redis-config";
import type {
	IInstanceQuery,
	IInstanceRegistration,
	ILifecycle,
	ITokenManager,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type {
	ServiceEndpoint,
	ServiceIdentity,
} from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";

export type {
	RedisClusterNodesConfig,
	RedisConnectionConfig,
	RedisSentinelConfig,
} from "@trading-model/common/config/redis-config";

import type Redis from "ioredis";
import { InstanceQueryService } from "./instance-query-service";
import { InstanceRegistrationService } from "./instance-registration-service";
import { LifecycleService } from "./lifecycle-service";
import { RedisBackendLifecycle } from "./redis-backend-lifecycle";
import { computePrefix, createRedisClient } from "./redis-client-factory";
import { RedisInstanceRepository } from "./redis-instance-repository";
import { RedisKeyBuilder } from "./redis-key-builder";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";
import { TokenHandler } from "./token-handler";
import { TokenManagerService } from "./token-manager-service";
import { TokenService } from "./token-service";

export class RedisRegistryBackend
	implements IInstanceRegistration, IInstanceQuery, ITokenManager, ILifecycle
{
	private readonly _registration: InstanceRegistrationService;
	private readonly _query: InstanceQueryService;
	private readonly _tokenManager: TokenManagerService;
	private readonly _lifecycleService: LifecycleService;

	constructor(
		configOrUrl: string | RedisConnectionConfig,
		prefix = "discovery:",
		signingSecret?: string,
		cleanupIntervalMs = 10_000
	) {
		const resolvedPrefix = computePrefix(prefix, configOrUrl);
		const keyBuilder = new RedisKeyBuilder(resolvedPrefix);
		const redis = createRedisClient(configOrUrl) as Redis;
		const tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
		const instances = new RedisInstanceRepository({
			redis,
			keyBuilder,
			tokenService,
		});
		const cleaner = new StaleInstanceCleaner(instances, cleanupIntervalMs);
		const tokenHandler = new TokenHandler(redis, keyBuilder, tokenService);
		const lifecycle = new RedisBackendLifecycle(redis, cleaner);

		this._registration = new InstanceRegistrationService(instances);
		this._query = new InstanceQueryService(instances);
		this._tokenManager = new TokenManagerService(tokenHandler);
		this._lifecycleService = new LifecycleService(lifecycle);
	}

	registerInstance(instance: ServiceInstance): Promise<string> {
		return this._registration.registerInstance(instance);
	}

	updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._registration.updateHeartbeat(id);
	}

	getInstances(serviceName: string): Promise<ServiceInstance[]> {
		return this._query.getInstances(serviceName);
	}

	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._query.getInstance(id);
	}

	removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._registration.removeInstance(id);
	}

	listServiceNames(): Promise<string[]> {
		return this._query.listServiceNames();
	}

	dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._query.dump();
	}

	updateToken(instanceId: string): Promise<string> {
		return this._tokenManager.updateToken(instanceId);
	}

	generateInstanceToken(instanceId: string): string {
		return this._tokenManager.generateInstanceToken(instanceId);
	}

	validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return this._tokenManager.validInstanceToken(validation);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._tokenManager.generateInstanceId(endpoint);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenManager.verifyInstanceName(serviceName);
	}

	start(): void {
		this._lifecycleService.start();
	}

	stop(): void {
		this._lifecycleService.stop();
	}

	async forceCleanup(): Promise<void> {
		await this._lifecycleService.forceCleanup();
	}
}
