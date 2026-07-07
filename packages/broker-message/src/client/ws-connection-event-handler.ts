import { logger } from "@trading-model/common/config/logger";
import type { IWsReconnector } from "@trading-model/common/ws/i-ws-reconnector";
import type { PendingPublishQueue } from "./pending-publish-queue";
import type { WssConnectionLifecycle } from "./wss-connection-lifecycle";

type ConnectFn = () => void;
type SendFn = (data: unknown) => boolean;

export class WsConnectionEventHandler {
	constructor(
		readonly _lifecycle: WssConnectionLifecycle,
		private readonly _reconnector: IWsReconnector,
		private readonly _queue: PendingPublishQueue
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
		this._reconnector.scheduleReconnect(() => connectFn());
	}
}
