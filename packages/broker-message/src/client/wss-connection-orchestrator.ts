import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

import { WssReconnector } from "./wss-reconnector";
import { PendingPublishQueue } from "./pending-publish-queue";
import { WssConnectionLifecycle } from "./wss-connection-lifecycle";
import { TopicSubscriptionManager } from "./topic-subscription-manager";
import { WsConnectionEventHandler } from "./ws-connection-event-handler";

export class WssConnectionOrchestrator {
	private readonly _lifecycle: WssConnectionLifecycle;
	private readonly _reconnector = new WssReconnector();
	private readonly _topicManager = new TopicSubscriptionManager();
	private readonly _eventHandler: WsConnectionEventHandler;
	private readonly _onConnect: () => void;

	constructor(
		config: {
			wssUrl: string;
			tlsConfig?: Partial<TlsPaths>;
			serviceName: string;
			instanceId: string;
		},
		onMessage: (raw: string) => void,
		private readonly _queue: PendingPublishQueue
	) {
		this._lifecycle = new WssConnectionLifecycle(config, {
			onOpen: () => this._eventHandler.onWsOpen(
				(data) => this._lifecycle.send(data),
				this._topicManager.topics,
			),
			onMessage: (raw: string) => onMessage(raw),
			onClose: () => this._eventHandler.onWsClose(),
			onError: (err: Error) => this._eventHandler.onWsError(err),
		});
		this._eventHandler = new WsConnectionEventHandler(
			this._lifecycle,
			this._reconnector,
			this._queue,
		);
		this._onConnect = () => {
			this._lifecycle.connect();
		};
	}

	get builtUrl(): string {
		return this._lifecycle.builtUrl;
	}

	connect(topics: string[]): void {
		this._topicManager.setTopics(topics);
		this._reconnector.shouldReconnect = true;
		this._connectWs();
	}

	private _connectWs(): void {
		logger.info("WSS connecting", {
			url: this._lifecycle.builtUrl,
			attempt: this._reconnector.attempt + 1,
		});
		try {
			this._onConnect();
		} catch (err) {
			logger.warn("WSS connection failed", {
				error: normalizeError(err as Error),
			});
			this._eventHandler.scheduleReconnect(() => this._onConnect());
		}
	}

	isConnected(): boolean {
		return this._lifecycle.isConnected();
	}

	send(data: unknown): boolean {
		return this._lifecycle.send(data);
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._lifecycle.disconnect(closeCode, reason);
	}

	addTopics(topics: string[]): void {
		this._topicManager.addTopics(topics);
	}

	removeTopics(topics: string[]): void {
		this._topicManager.removeTopics(topics);
	}

	get shouldReconnect(): boolean {
		return this._reconnector.shouldReconnect;
	}

	stop(): void {
		this._reconnector.stop();
	}
}
