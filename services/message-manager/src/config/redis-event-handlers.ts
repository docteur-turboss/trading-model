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
		onError: (err: Error) => {
			if (redisClosed()) {
				return;
			}
			logger.error(`${name} client error`, {
				error: (err as Error).message,
			});
		},
		onConnect: () => {
			if (redisClosed()) {
				return;
			}
			logger.info(`${name}: connected`);
		},
		onReady: () => {
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
		},
		onClose: () => {
			if (redisClosed()) {
				return;
			}
			logger.warn(`${name}: connection closed`);
		},
		onReconnecting: (delay: number) => {
			if (redisClosed()) {
				return;
			}
			logger.warn(`${name}: reconnecting in ${delay}ms`);
		},
	};
}

export function attachEventHandlers(client: Redis, handlers: EventHandlers): void {
	client.on("error", handlers.onError);
	client.on("connect", handlers.onConnect);
	client.on("ready", handlers.onReady);
	client.on("close", handlers.onClose);
	client.on("reconnecting", handlers.onReconnecting);
}

export function detachEventHandlers(client: Redis, handlers: EventHandlers): void {
	client.off("error", handlers.onError);
	client.off("connect", handlers.onConnect);
	client.off("ready", handlers.onReady);
	client.off("close", handlers.onClose);
	client.off("reconnecting", handlers.onReconnecting);
}
