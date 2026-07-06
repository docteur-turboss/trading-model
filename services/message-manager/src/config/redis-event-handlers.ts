import type Redis from "ioredis";

import { logger } from "./logger";

export interface EventHandlers {
	onError: (err: Error) => void;
	onConnect: () => void;
	onReady: () => void;
	onClose: () => void;
	onReconnecting: (delay: number) => void;
}

export function createEventHandlers(
	name: string,
	redisClosed: () => boolean,
	onReconnectedCallbacks: Array<() => void>
): EventHandlers {
	return {
		onError: (err: Error) => handleError(name, redisClosed, err),
		onConnect: () => handleConnect(name, redisClosed),
		onReady: () => handleReady(name, redisClosed, onReconnectedCallbacks),
		onClose: () => handleClose(name, redisClosed),
		onReconnecting: (delay: number) =>
			handleReconnecting(name, redisClosed, delay),
	};
}

function handleError(name: string, redisClosed: () => boolean, err: Error) {
	if (redisClosed()) {
		return;
	}
	logger.error(`${name} client error`, { error: err.message });
}

function handleConnect(name: string, redisClosed: () => boolean) {
	if (redisClosed()) {
		return;
	}
	logger.info(`${name}: connected`);
}

function handleReady(
	name: string,
	redisClosed: () => boolean,
	onReconnectedCallbacks: Array<() => void>
) {
	if (redisClosed()) {
		return;
	}
	logger.info(`${name}: ready`);
	for (const cb of onReconnectedCallbacks) {
		try {
			cb();
		} catch {
			/* best-effort */
		}
	}
}

function handleClose(name: string, redisClosed: () => boolean) {
	if (redisClosed()) {
		return;
	}
	logger.warn(`${name}: connection closed`);
}

function handleReconnecting(
	name: string,
	redisClosed: () => boolean,
	delay: number
) {
	if (redisClosed()) {
		return;
	}
	logger.warn(`${name}: reconnecting in ${delay}ms`);
}

export function attachEventHandlers(
	client: Redis,
	handlers: EventHandlers
): void {
	client.on("error", handlers.onError);
	client.on("connect", handlers.onConnect);
	client.on("ready", handlers.onReady);
	client.on("close", handlers.onClose);
	client.on("reconnecting", handlers.onReconnecting);
}

export function detachEventHandlers(
	client: Redis,
	handlers: EventHandlers
): void {
	client.off("error", handlers.onError);
	client.off("connect", handlers.onConnect);
	client.off("ready", handlers.onReady);
	client.off("close", handlers.onClose);
	client.off("reconnecting", handlers.onReconnecting);
}
