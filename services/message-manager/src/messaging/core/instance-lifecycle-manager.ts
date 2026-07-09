import { toInstanceId, toTopic } from "@trading-model/common/domain/primitives";
import { getSubscriptionClient } from "../../config/redis";
import { LEASE_HEARTBEAT_FIELD } from "./messaging-constants";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";
import { StaleInstanceScanner } from "./stale-instance-scanner";

const SUBSCRIPTION_TTL_MS = 30_000;

export class InstanceLifecycleManager {
	private _keys: RedisSubscriptionKeys;
	private _scanner: StaleInstanceScanner;

	constructor(prefix: string) {
		this._keys = new RedisSubscriptionKeys(prefix);
		this._scanner = new StaleInstanceScanner(prefix);
	}

	async heartbeat(instanceId: string): Promise<void> {
		const redis = await getSubscriptionClient();
		const leaseKey = this._keys.leaseKey(instanceId);
		await redis.hset(leaseKey, LEASE_HEARTBEAT_FIELD, Date.now().toString());
		await redis.expire(leaseKey, Math.ceil(SUBSCRIPTION_TTL_MS / 1000));
	}

	isStaleByHeartbeat(instanceId: string): Promise<boolean> {
		return this._scanner.isStaleByHeartbeat(instanceId);
	}

	async renewLease(instanceId: string, topics: string[]): Promise<void> {
		if (topics.length === 0) {
			return;
		}
		const redis = await getSubscriptionClient();
		const multi = redis.multi();
		const now = Date.now().toString();
		for (const topic of topics) {
			this._addRenewCommands(multi, instanceId, topic, now);
		}
		await multi.exec();
	}

	private _addRenewCommands(
		multi: ReturnType<import("ioredis").Redis["multi"]>,
		instanceId: string,
		topic: string,
		now: string
	): void {
		multi.hset(this._keys.leaseKey(instanceId), topic, now);
		multi.hset(this._keys.leaseKey(instanceId), LEASE_HEARTBEAT_FIELD, now);
		multi.expire(
			this._keys.leaseKey(instanceId),
			Math.ceil(SUBSCRIPTION_TTL_MS / 1000)
		);
		multi.expire(
			this._keys.subKey({
				topic: toTopic(topic),
				instanceId: toInstanceId(instanceId),
			}),
			Math.ceil(SUBSCRIPTION_TTL_MS / 1000)
		);
	}

	removeStaleInstances(): Promise<number> {
		return this._scanner.removeStaleInstances();
	}
}
