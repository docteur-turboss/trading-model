import { randomUUID } from "node:crypto";

import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";
import { normalizeError } from "@trading-model/common/utils/errors";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getSubscriptionClient } from "../../config/redis";
import {
	InstanceLifecycleManager,
	LEASE_HEARTBEAT_FIELD,
} from "./instance-lifecycle-manager";

export { LEASE_HEARTBEAT_FIELD };

export interface SubscriptionEntry {
	id: string;
	topic: string;
	callbackPath: string;
	serviceIdentity: ServiceIdentity;
	createdAt: string;
}

const SUBSCRIPTION_TTL_MS = 30_000;

export class SubscriptionStore {
	private _prefix: string;
	private _lifecycleManager: InstanceLifecycleManager;

	constructor() {
		this._prefix = ENV.REDIS_PREFIX;
		this._lifecycleManager = new InstanceLifecycleManager(this._prefix);
	}

	private _topicKey(topic: string): string {
		return `${this._prefix}sub:${topic}`;
	}

	private _instanceKey(instanceId: string): string {
		return `${this._prefix}instance:${instanceId}`;
	}

	private _subKey(topic: string, instanceId: string): string {
		return `${this._topicKey(topic)}:${instanceId}`;
	}

	async add(
		topic: string,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> {
		const redis = await getSubscriptionClient();
		const subKey = this._subKey(topic, serviceIdentity.instanceId);
		const exists = await redis.exists(subKey);
		if (exists) {
			return;
		}

		const entry: SubscriptionEntry = {
			id: randomUUID(),
			topic,
			callbackPath,
			serviceIdentity,
			createdAt: new Date().toISOString(),
		};

		const multi = redis.multi();
		multi.hset(subKey, "data", JSON.stringify(entry));
		multi.expire(subKey, Math.ceil(SUBSCRIPTION_TTL_MS / 1000));
		multi.sadd(this._topicKey(topic), serviceIdentity.instanceId);
		multi.sadd(this._instanceKey(serviceIdentity.instanceId), topic);
		multi.sadd(this._topicsSetKey(), topic);
		multi.sadd(this._activeInstancesKey(), serviceIdentity.instanceId);
		multi.hset(
			`${this._prefix}lease:${serviceIdentity.instanceId}`,
			topic,
			Date.now().toString()
		);
		multi.expire(
			`${this._prefix}lease:${serviceIdentity.instanceId}`,
			Math.ceil(SUBSCRIPTION_TTL_MS / 1000)
		);
		await multi.exec();
	}

	async remove(topic: string, instanceId: string): Promise<void> {
		const redis = await getSubscriptionClient();
		const subKey = this._subKey(topic, instanceId);
		const multi = redis.multi();
		multi.del(subKey);
		multi.srem(this._topicKey(topic), instanceId);
		multi.srem(this._instanceKey(instanceId), topic);
		multi.hdel(`${this._prefix}lease:${instanceId}`, topic);
		multi.scard(this._instanceKey(instanceId));
		multi.scard(this._topicKey(topic));
		const results = await multi.exec();
		if (!results) {
			return;
		}
		// If instance has no more topics, remove from active set
		const instanceScard = results[results.length - 2];
		if (
			instanceScard[0] === null &&
			typeof instanceScard[1] === "number" &&
			(instanceScard[1] as number) === 0
		) {
			try {
				await redis.srem(this._activeInstancesKey(), instanceId);
			} catch {
				/* best-effort */
			}
		}
		// Read scard result from pipeline (last result) to avoid extra round-trip
		const scardResult = results[results.length - 1];
		if (
			scardResult[0] === null &&
			typeof scardResult[1] === "number" &&
			(scardResult[1] as number) === 0
		) {
			try {
				await redis.srem(this._topicsSetKey(), topic);
			} catch {
				// best-effort
			}
		}
	}

	async getByTopic(topic: string): Promise<SubscriptionEntry[]> {
		const redis = await getSubscriptionClient();
		const instanceIds = await redis.smembers(this._topicKey(topic));
		if (instanceIds.length === 0) {
			return [];
		}

		const entries: SubscriptionEntry[] = [];
		const pipeline = redis.pipeline();
		for (const id of instanceIds) {
			pipeline.hget(this._subKey(topic, id), "data");
		}
		const results = await pipeline.exec();
		if (!results) {
			return [];
		}

		for (const [err, data] of results) {
			if (err || !data) {
				continue;
			}
			try {
				const entry = JSON.parse(data as string) as SubscriptionEntry;
				entries.push(entry);
			} catch (parseErr) {
				logger.warn("Failed to parse subscription entry", { context: {
					error: normalizeError(parseErr as Error),
				} });
			}
		}
		return entries;
	}

	async getTopicsByInstance(instanceId: string): Promise<string[]> {
		const redis = await getSubscriptionClient();
		return redis.smembers(this._instanceKey(instanceId));
	}

	async getAllTopics(): Promise<string[]> {
		const redis = await getSubscriptionClient();
		const topics: string[] = [];
		let cursor = "0";
		do {
			const [nextCursor, batch] = await redis.sscan(
				this._topicsSetKey(),
				cursor,
				"COUNT",
				100
			);
			topics.push(...batch);
			cursor = nextCursor;
		} while (cursor !== "0");
		return topics;
	}

	private _topicsSetKey(): string {
		return `${this._prefix}topics`;
	}

	private _activeInstancesKey(): string {
		return `${this._prefix}active-instances`;
	}

	renewLease(instanceId: string, topics: string[]): Promise<void> {
		return this._lifecycleManager.renewLease(instanceId, topics);
	}

	heartbeat(instanceId: string): Promise<void> {
		return this._lifecycleManager.heartbeat(instanceId);
	}

	isStaleByHeartbeat(instanceId: string): Promise<boolean> {
		return this._lifecycleManager.isStaleByHeartbeat(instanceId);
	}

	removeStaleInstances(): Promise<number> {
		return this._lifecycleManager.removeStaleInstances();
	}

	async healthCheck(): Promise<boolean> {
		try {
			const redis = await getSubscriptionClient();
			await redis.ping();
			return true;
		} catch {
			return false;
		}
	}
}

export const subscriptionStore = new SubscriptionStore();
