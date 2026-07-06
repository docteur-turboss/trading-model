import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";

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

	async subscribe(channel: string, handler: (message: string) => void): Promise<() => void> {
		const subscriber = this._duplicateSubscriber();
		let unsubscribed = false;
		const onMessage = (_ch: string, msg: string) => {
			if (!unsubscribed) {
				handler(msg);
			}
		};
		try {
			await _doSubscribe(subscriber, channel);
			subscriber.on("message", onMessage);
			subscriber.on("reconnecting", () => {
				logger.info("Redis subscriber reconnecting, will re-subscribe to channel", { context: { channel } });
			});
			subscriber.on("connect", () => {
				if (!unsubscribed) {
					_doSubscribe(subscriber, channel).catch(() => {});
				}
			});
			return _createUnsubscriber({
				subscriber,
				channel,
				onMessage,
				onClose: () => {
					unsubscribed = true;
				},
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
		// retry will handle
	}
}

interface UnsubscriberContext {
	subscriber: Redis;
	channel: string;
	onMessage: (_ch: string, msg: string) => void;
	onClose?: () => void;
}

function _createUnsubscriber({ subscriber, channel, onMessage, onClose }: UnsubscriberContext): () => void {
	return () => {
		onClose?.();
		subscriber.removeListener("message", onMessage);
		subscriber.unsubscribe(channel).catch(() => {});
		subscriber.quit().catch(() => {});
	};
}
