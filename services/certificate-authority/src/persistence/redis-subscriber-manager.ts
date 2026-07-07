import { logger } from "@trading-model/common/config/logger";
import type Redis from "ioredis";

export class RedisSubscriberManager {
	constructor(private readonly _client: Redis) {}

	private _duplicateSubscriber(): Redis {
		return this._client.duplicate({
			retryStrategy: (times) => {
				if (times > 10) {
					return null;
				}
				return Math.min(times * 1000, 30000);
			},
		});
	}

	private _setupReconnectHandler(subscriber: Redis, channel: string): void {
		subscriber.on("reconnecting", () => {
			logger.info("Redis subscriber reconnecting, will re-subscribe to channel", {
				context: { channel },
			});
		});
	}

	private _setupConnectHandler(subscriber: Redis, channel: string, unsubscribed: { value: boolean }): void {
		subscriber.on("connect", () => {
			if (!unsubscribed.value) {
				_doSubscribe(subscriber, channel).catch(() => {});
			}
		});
	}

	async subscribe(
		channel: string,
		handler: (message: string) => void
	): Promise<() => void> {
		const subscriber = this._duplicateSubscriber();
		const unsubscribed = { value: false };
		const onMessage = (_ch: string, msg: string) => {
			if (!unsubscribed.value) handler(msg);
		};
		try {
			await _doSubscribe(subscriber, channel);
			subscriber.on("message", onMessage);
			this._setupReconnectHandler(subscriber, channel);
			this._setupConnectHandler(subscriber, channel, unsubscribed);
			return _createUnsubscriber({
				subscriber,
				channel,
				onMessage,
				onClose: () => { unsubscribed.value = true; },
			});
		} catch {
			subscriber.quit().catch(() => {});
			return () => {};
		}
	}
}

async function _doSubscribe(subscriber: Redis, channel: string): Promise<void> {
	try {
		await subscriber.subscribe(channel);
	} catch {
		logger.debug("Redis subscribe failed, retry will handle");
	}
}

interface UnsubscriberContext {
	subscriber: Redis;
	channel: string;
	onMessage: (_ch: string, msg: string) => void;
	onClose?: () => void;
}

function _createUnsubscriber({
	subscriber,
	channel,
	onMessage,
	onClose,
}: UnsubscriberContext): () => void {
	return () => {
		onClose?.();
		subscriber.removeListener("message", onMessage);
		subscriber.unsubscribe(channel).catch(() => {});
		subscriber.quit().catch(() => {});
	};
}
