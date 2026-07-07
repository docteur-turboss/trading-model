import { randomBytes } from "node:crypto";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type {
	ServiceEndpoint,
	ServiceIdentity,
} from "@trading-model/common/domain/service-identity";
import type { RedisConnectionConfig } from "@trading-model/common/config/redis-config";
import type {
	TokenValidation,
} from "@trading-model/common/domain/token-validation";
export type {
	RedisClusterNodesConfig,
	RedisConnectionConfig,
	RedisSentinelConfig,
} from "@trading-model/common/config/redis-config";
import type Redis from "ioredis";
import { RedisBackendLifecycle } from "./redis-backend-lifecycle";
import { computePrefix, createRedisClient } from "./redis-client-factory";
import { RedisInstanceRepository } from "./redis-instance-repository";
import { RedisKeyBuilder } from "./redis-key-builder";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";
import { TokenHandler } from "./token-handler";
import { TokenService } from "./token-service";

export class RedisRegistryBackend implements RegistryBackend {
	private readonly _instances: RedisInstanceRepository;
	private readonly _tokenHandler: TokenHandler;
	private readonly _lifecycle: RedisBackendLifecycle;

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
		this._instances = new RedisInstanceRepository({ redis, keyBuilder, tokenService });
		const cleaner = new StaleInstanceCleaner(
			this._instances,
			cleanupIntervalMs
		);
		this._tokenHandler = new TokenHandler(redis, keyBuilder, tokenService);
		this._lifecycle = new RedisBackendLifecycle(redis, cleaner);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		return this._instances.registerInstance(instance);
	}

	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._instances.updateHeartbeat(id);
	}

	async getInstances(serviceName: string): Promise<ServiceInstance[]> {
		return this._instances.getInstances(serviceName);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._instances.getInstance(id);
	}

	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._instances.removeInstance(id);
	}

	async listServiceNames(): Promise<string[]> {
		return this._instances.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._instances.dump();
	}

	async updateToken(instanceId: string): Promise<string> {
		return this._tokenHandler.updateToken(instanceId);
	}

	generateInstanceToken(instanceId: string): string {
		return this._tokenHandler.generateInstanceToken(instanceId);
	}

	async validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return this._tokenHandler.validInstanceToken(validation);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._tokenHandler.generateInstanceId(endpoint);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenHandler.verifyInstanceName(serviceName);
	}

	start(): void {
		this._lifecycle.start();
	}

	stop(): void {
		this._lifecycle.stop();
	}

	async forceCleanup(): Promise<void> {
		await this._lifecycle.forceCleanup();
	}
}
