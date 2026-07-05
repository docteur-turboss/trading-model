import Redis, { Cluster, type RedisOptions } from "ioredis";

import { ENV } from "./env";
import { logger } from "./logger";

interface ManagedRedis {
	client: Redis | null;
	promise: Promise<Redis> | null;
	name: string;
}

const CLIENTS: Record<string, ManagedRedis> = {
	operations: { client: null, promise: null, name: "Redis" },
	streams: { client: null, promise: null, name: "Redis[streams]" },
	subscriptions: { client: null, promise: null, name: "Redis[subs]" },
};

const ALL_CLIENTS: Set<Redis> = new Set();

let redisClosed = false;

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

function buildRedisOptions(): Record<string, unknown> {
	const url = ENV.REDIS_URL;
	const tls = ENV.REDIS_TLS_ENABLED
		? { tls: { rejectUnauthorized: true } }
		: {};
	const opts: Record<string, unknown> = {
		retryStrategy: (retries: number) => redisRetryDelay(retries),
		lazyConnect: true,
		maxRetriesPerRequest: null,
		enableReadyCheck: true,
		...tls,
	};
	if (url) {
		return opts;
	}
	return {
		...opts,
		host: ENV.REDIS_HOST,
		port: ENV.REDIS_PORT,
		password: ENV.REDIS_PASSWORD || undefined,
		db: ENV.REDIS_DB,
	};
}

function buildSentinelClient(): Redis {
	let sentinelNodes: Array<{ host: string; port: number }>;
	try {
		sentinelNodes = ENV.REDIS_SENTINEL_NODES
			? (JSON.parse(ENV.REDIS_SENTINEL_NODES) as Array<{
					host: string;
					port: number;
				}>)
			: [{ host: ENV.REDIS_HOST, port: ENV.REDIS_PORT }];
	} catch (cause) {
		const err = new Error(
			`Invalid REDIS_SENTINEL_NODES JSON: ${(cause as Error).message}`
		);
		(err as { cause?: unknown }).cause = cause;
		throw err;
	}
	const sentinelOpts: Record<string, unknown> = {
		sentinels: sentinelNodes,
		name: ENV.REDIS_SENTINEL_MASTER_NAME,
		password: ENV.REDIS_SENTINEL_PASSWORD || undefined,
		db: ENV.REDIS_DB,
		retryStrategy: (retries: number) => redisRetryDelay(retries),
		lazyConnect: true,
		maxRetriesPerRequest: null,
		enableReadyCheck: true,
	};
	if (ENV.REDIS_TLS_ENABLED) {
		sentinelOpts.tls = { rejectUnauthorized: true };
	}
	return new Redis(sentinelOpts as RedisOptions) as unknown as Redis;
}

function buildClusterClient(): Redis {
	let clusterNodes: Array<{ host: string; port: number }>;
	try {
		clusterNodes = JSON.parse(ENV.REDIS_CLUSTER_NODES) as Array<{
			host: string;
			port: number;
		}>;
	} catch (cause) {
		const err = new Error(
			`Invalid REDIS_CLUSTER_NODES JSON: ${(cause as Error).message}`
		);
		(err as { cause?: unknown }).cause = cause;
		throw err;
	}
	return new Cluster(clusterNodes, {
		redisOptions: {
			password: ENV.REDIS_PASSWORD || undefined,
			lazyConnect: true,
			maxRetriesPerRequest: null,
			enableReadyCheck: true,
		},
		clusterRetryStrategy: (retries: number) => {
			const maxAttempts = ENV.REDIS_MAX_RECONNECT_ATTEMPTS;
			if (maxAttempts === 0 || (maxAttempts > 0 && retries >= maxAttempts)) {
				if (retries > 0 || maxAttempts === 0) {
					logger.error(
						`Redis Cluster: max reconnection attempts (${maxAttempts}) reached`
					);
				}
				return null;
			}
			return redisRetryDelay(retries);
		},
		scaleReads: "slave",
		enableAutoPipelining: true,
	}) as unknown as Redis;
}

function buildStandaloneClient(): Redis {
	const options = buildRedisOptions();
	return new Redis(options as RedisOptions);
}

function buildRedisInstance(): Redis {
	if (ENV.REDIS_SENTINEL_MASTER_NAME) {
		return buildSentinelClient();
	}
	if (ENV.REDIS_CLUSTER_NODES) {
		return buildClusterClient();
	}
	return buildStandaloneClient();
}

function redisRetryDelay(retries: number): number | null {
	const maxAttempts = ENV.REDIS_MAX_RECONNECT_ATTEMPTS;
	if (maxAttempts === 0 || (maxAttempts > 0 && retries >= maxAttempts)) {
		if (retries > 0 || maxAttempts === 0) {
			logger.error(
				`Redis: max reconnection attempts (${maxAttempts}) reached, giving up`
			);
		}
		return null;
	}
	const baseDelay = Math.min(1000 * 2 ** (retries - 1), 30000);
	const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
	const delay = Math.max(100, Math.round(baseDelay + jitter));
	if (retries > 1) {
		logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${retries})`);
	}
	return delay;
}

function destroyClient(client: Redis): void {
	client.removeAllListeners();
	try {
		client.disconnect();
	} catch {
		/* best-effort */
	}
	ALL_CLIENTS.delete(client);
}

async function waitForReconnect(slot: ManagedRedis): Promise<Redis | null> {
	if (
		slot.client &&
		(slot.client.status === "connecting" ||
			slot.client.status === "reconnecting")
	) {
		try {
			const ReconnectTimeoutMs = 30000;
			await new Promise<void>((resolve, reject) => {
				const timeoutId = setTimeout(
					() => reject(new Error("timeout")),
					ReconnectTimeoutMs
				);
				slot.client!.once("ready", () => {
					clearTimeout(timeoutId);
					resolve();
				});
			});
			return slot.client;
		} catch {
			// Reconnection timed out — fall through to create new client
		}
	}
	return null;
}

async function createAndConnectClient(slot: ManagedRedis): Promise<Redis> {
	const client = buildRedisInstance();
	ALL_CLIENTS.add(client);

	const handlers = createEventHandlers(slot);
	attachEventHandlers(client, handlers);

	try {
		await client.connect();
		if (redisClosed) {
			destroyClient(client);
			throw new Error("Redis has been closed");
		}
		if (slot.client && slot.client !== client) {
			destroyClient(slot.client);
		}
		slot.client = client;
		return client;
	} catch (err) {
		if (!redisClosed) {
			logger.error(`${slot.name}: failed to connect`, {
				error: (err as Error).message,
			});
		}
		detachEventHandlers(client, handlers);
		ALL_CLIENTS.delete(client);
		throw err;
	}
}

interface EventHandlers {
	onError: (err: Error) => void;
	onConnect: () => void;
	onReady: () => void;
	onClose: () => void;
	onReconnecting: (delay: number) => void;
}

function createEventHandlers(slot: ManagedRedis): EventHandlers {
	return {
		onError: (err: Error) => {
			if (redisClosed) {
				return;
			}
			logger.error(`${slot.name} client error`, {
				error: (err as Error).message,
			});
		},
		onConnect: () => {
			if (redisClosed) {
				return;
			}
			logger.info(`${slot.name}: connected`);
		},
		onReady: () => {
			if (redisClosed) {
				return;
			}
			logger.info(`${slot.name}: ready`);
			for (const cb of ON_RECONNECTED_CALLBACKS) {
				try {
					cb();
				} catch {
					/* best-effort */
				}
			}
		},
		onClose: () => {
			if (redisClosed) {
				return;
			}
			logger.warn(`${slot.name}: connection closed`);
		},
		onReconnecting: (delay: number) => {
			if (redisClosed) {
				return;
			}
			logger.warn(`${slot.name}: reconnecting in ${delay}ms`);
		},
	};
}

function attachEventHandlers(client: Redis, handlers: EventHandlers): void {
	client.on("error", handlers.onError);
	client.on("connect", handlers.onConnect);
	client.on("ready", handlers.onReady);
	client.on("close", handlers.onClose);
	client.on("reconnecting", handlers.onReconnecting);
}

function detachEventHandlers(client: Redis, handlers: EventHandlers): void {
	client.off("error", handlers.onError);
	client.off("connect", handlers.onConnect);
	client.off("ready", handlers.onReady);
	client.off("close", handlers.onClose);
	client.off("reconnecting", handlers.onReconnecting);
}

async function getOrCreateClient(slot: ManagedRedis): Promise<Redis> {
	if (redisClosed) {
		throw new Error("Redis has been closed — cannot create new client");
	}
	if (slot.client && slot.client.status === "ready") {
		return slot.client;
	}

	const existing = slot.promise === null ? null : await slot.promise;
	if (existing) {
		return existing;
	}

	const reconnected = await waitForReconnect(slot);
	if (reconnected) {
		return reconnected;
	}

	slot.promise = createAndConnectClient(slot).finally(() => {
		slot.promise = null;
	});

	return slot.promise;
}

export async function getRedisClient(): Promise<Redis> {
	return await getOrCreateClient(CLIENTS.operations);
}

export async function getStreamClient(): Promise<Redis> {
	return await getOrCreateClient(CLIENTS.streams);
}

export async function getSubscriptionClient(): Promise<Redis> {
	return await getOrCreateClient(CLIENTS.subscriptions);
}

export function closeRedis(): void {
	redisClosed = true;
	for (const client of ALL_CLIENTS) {
		try {
			client.removeAllListeners();
		} catch {
			/* best-effort */
		}
		try {
			client.disconnect();
		} catch {
			/* best-effort */
		}
	}
	ALL_CLIENTS.clear();
	for (const [, slot] of Object.entries(CLIENTS)) {
		slot.client = null;
		slot.promise = null;
	}
}

export async function isRedisAvailable(): Promise<boolean> {
	try {
		const client = await getRedisClient();
		const pong = await client.ping();
		return pong === "PONG";
	} catch {
		return false;
	}
}

export function getRedisOrThrow(): Redis {
	const slot = CLIENTS.operations;
	if (slot.client?.status !== "ready") {
		throw new Error("Redis is not available");
	}
	return slot.client;
}
