import { REDIS_RESP } from "@trading-model/common/persistence/redis-constants";
import type Redis from "ioredis";
import { createRedisClient } from "./redis-client-factory";
import { RedisClientPool } from "./redis-client-pool";

const ON_RECONNECTED_CALLBACKS: Array<() => void> = [];

export function onRedisReconnected(cb: () => void): void {
	ON_RECONNECTED_CALLBACKS.push(cb);
}

export function removeRedisReconnectedCallback(cb: () => void): void {
	const idx = ON_RECONNECTED_CALLBACKS.indexOf(cb);
	if (idx >= 0) {
		ON_RECONNECTED_CALLBACKS.splice(idx, 1);
	}
}

let redisClosed = false;

function createPool(name: string): RedisClientPool {
	return new RedisClientPool(name, () => redisClosed, ON_RECONNECTED_CALLBACKS);
}

const operationsPool = createPool("Redis");
const streamsPool = createPool("Redis[streams]");
const subscriptionsPool = createPool("Redis[subs]");

function buildClient(): Redis {
	return createRedisClient();
}

export function getRedisClient(): Promise<Redis> {
	return operationsPool.getOrCreate(buildClient);
}

export function getStreamClient(): Promise<Redis> {
	return streamsPool.getOrCreate(buildClient);
}

export function getSubscriptionClient(): Promise<Redis> {
	return subscriptionsPool.getOrCreate(buildClient);
}

export function closeRedis(): void {
	redisClosed = true;
	operationsPool.destroyAll();
	streamsPool.destroyAll();
	subscriptionsPool.destroyAll();
}

export async function isRedisAvailable(): Promise<boolean> {
	try {
		const client = await getRedisClient();
		const pong = await client.ping();
		return pong === REDIS_RESP.PONG;
	} catch {
		return false;
	}
}

export function getRedisOrThrow(): Redis {
	return operationsPool.getClientOrThrow();
}
