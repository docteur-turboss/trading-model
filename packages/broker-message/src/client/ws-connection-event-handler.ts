import { logger } from "@trading-model/common/config/logger";
import { WssConnectionLifecycle } from "./wss-connection-lifecycle";
import { WssReconnector } from "./wss-reconnector";
import { PendingPublishQueue } from "./pending-publish-queue";

type ConnectFn = () => void;
type SendFn = (data: unknown) => boolean;

export class WsConnectionEventHandler {
	constructor(
		private readonly _lifecycle: WssConnectionLifecycle,
		private readonly _reconnector: WssReconnector,
		private readonly _queue: PendingPublishQueue,
	) {}

	onWsOpen(sendFn: SendFn, topics: string[]): void {
		this._reconnector.reset();
		logger.info("WSS connected");

		if (topics.length > 0) {
			sendFn({
				type: "subscribe",
				topics,
			});
		}

		this._queue.flush((data) => sendFn(data));
	}

	onWsClose(): void {
		logger.warn("WSS disconnected");
	}

	onWsError(err: Error): void {
		logger.warn("WSS error", { error: err.message });
	}

	scheduleReconnect(connectFn: ConnectFn): void {
		this._reconnector.scheduleReconnect(
			() => connectFn(),
			() => this._queue.drainToHttp()
		);
	}
}
