import Redis from "ioredis";

import { ENV } from "./env";
import { logger } from "./logger";
import { createRedisClient } from "./redis-client-factory";
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
	if (!isReconnecting(slot)) {
		return null;
	}
	try {
		return await waitForClientReady(slot);
	} catch {
		return null;
	}
}

function isReconnecting(slot: ManagedRedis): boolean {
	return !!(slot.client &&
		(slot.client.status === "connecting" ||
			slot.client.status === "reconnecting"));
}

async function waitForClientReady(slot: ManagedRedis): Promise<Redis> {
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
	return slot.client!;
}

async function createAndConnectClient(slot: ManagedRedis): Promise<Redis> {
	const client = createRedisClient();
	ALL_CLIENTS.add(client);

	const handlers = createEventHandlers(slot.name, () => redisClosed, ON_RECONNECTED_CALLBACKS);
	attachEventHandlers(client, handlers);

	try {
		return await connectAndReplace(slot, client, handlers);
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

async function connectAndReplace(
	slot: ManagedRedis,
	client: Redis,
	handlers: ReturnType<typeof createEventHandlers>
): Promise<Redis> {
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
}

async function getOrCreateClient(slot: ManagedRedis): Promise<Redis> {
	if (redisClosed) {
		throw new Error("Redis has been closed — cannot create new client");
	}
	if (isReady(slot)) {
		return slot.client!;
	}

	const existing = await resolvePendingPromise(slot);
	if (existing) {
		return existing;
	}

	const reconnected = await waitForReconnect(slot);
	if (reconnected) {
		return reconnected;
	}

	return startNewConnection(slot);
}

function isReady(slot: ManagedRedis): boolean {
	return !!(slot.client && slot.client.status === "ready");
}

async function resolvePendingPromise(slot: ManagedRedis): Promise<Redis | null> {
	return slot.promise === null ? null : await slot.promise;
}

function startNewConnection(slot: ManagedRedis): Promise<Redis> {
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
	destroyAllClients();
	resetAllSlots();
}

function destroyAllClients(): void {
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
}

function resetAllSlots(): void {
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
