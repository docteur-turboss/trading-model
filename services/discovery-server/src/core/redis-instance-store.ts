import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import Redis from "ioredis";
import { RedisKeyBuilder } from "./redis-key-builder";
import { TokenService } from "./token-service";
import { InstanceMetadataReader } from "./instance-metadata-reader";
import { InstanceRegistrar } from "./instance-registrar";
import { InstanceHeartbeatHandler } from "./instance-heartbeat-handler";
import { InstanceCleanupHandler } from "./instance-cleanup-handler";

export class RedisInstanceStore {
	private readonly _reader: InstanceMetadataReader;
	private readonly _registrar: InstanceRegistrar;
	private readonly _heartbeatHandler: InstanceHeartbeatHandler;
	private readonly _cleanupHandler: InstanceCleanupHandler;

	constructor(
		private readonly _redis: Redis,
		private readonly _keyBuilder: RedisKeyBuilder,
		private readonly _tokenService: TokenService,
	) {
		this._reader = new InstanceMetadataReader(_redis, _keyBuilder);
		this._registrar = new InstanceRegistrar(_redis, _keyBuilder, _tokenService);
		this._heartbeatHandler = new InstanceHeartbeatHandler(_redis, _keyBuilder, this._reader);
		this._cleanupHandler = new InstanceCleanupHandler(_redis, _keyBuilder);
	}

	async resolveToken(instanceId: string): Promise<string> {
		return this._registrar.resolveToken(instanceId);
	}

	async buildStoredInstance(instance: ServiceInstance, now: number): Promise<ServiceInstance> {
		return this._registrar.buildStoredInstance(instance, now);
	}

	async getMetadata(instanceId: string): Promise<ServiceInstance | undefined> {
		return this._reader.getMetadata(instanceId);
	}

	async getServiceInstanceIds(serviceName: string): Promise<string[]> {
		return this._reader.getServiceInstanceIds(serviceName);
	}

	async getMetadatas(keys: string[]): Promise<ServiceInstance[]> {
		return this._reader.getMetadatas(keys);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		return this._registrar.registerInstance(instance);
	}

	async updateHeartbeat(serviceName: string, instanceId: string): Promise<number | false> {
		return this._heartbeatHandler.updateHeartbeat(serviceName, instanceId);
	}

	async removeInstanceSetAndMetadata(serviceName: string, instanceId: string): Promise<boolean> {
		return this._cleanupHandler.removeInstanceSetAndMetadata(serviceName, instanceId);
	}

	async listServiceNames(): Promise<string[]> {
		return this._reader.listServiceNames();
	}
}
