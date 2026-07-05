import Redis from "ioredis";

import { ENV } from "./env";
import { logger } from "./logger";
import { buildRedisInstance } from "./redis-client-factory";
import {
	attachEventHandlers,
	createEventHandlers,
	detachEventHandlers,
} from "./redis-event-handlers";

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

	const handlers = createEventHandlers(slot.name, () => redisClosed, ON_RECONNECTED_CALLBACKS);
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
