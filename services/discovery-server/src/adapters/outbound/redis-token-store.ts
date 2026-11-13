import type {
	AuthToken,
	InstanceId,
} from "@trading-model/primitives/primitives";
import type { InstanceTokenStorePort } from "../../domain/ports/instance-token-store.port";
import type { RedisDeps } from "../../shared/redis-deps";
import { instanceToken } from "../../shared/redis-key-builder";

/**
 * Token store shared by every discovery replica. Same key as the instance
 * metadata cleanup (instance-cleanup-handler), so an expired lease drops it.
 */
export class RedisTokenStore implements InstanceTokenStorePort {
	constructor(private readonly _deps: RedisDeps) {}

	async get(instanceId: InstanceId): Promise<AuthToken | undefined> {
		const token = await this._deps.redis.get(this._key(instanceId));
		return (token ?? undefined) as AuthToken | undefined;
	}

	async set(instanceId: InstanceId, token: AuthToken): Promise<void> {
		await this._deps.redis.set(this._key(instanceId), token);
	}

	async delete(instanceId: InstanceId): Promise<void> {
		await this._deps.redis.del(this._key(instanceId));
	}

	private _key(instanceId: InstanceId): string {
		return instanceToken(this._deps.keyPrefix, instanceId);
	}
}
