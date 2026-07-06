import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";

import { WssReconnector } from "./wss-reconnector";
import { PendingPublishQueue } from "./pending-publish-queue";
import { WssConnectionLifecycle } from "./wss-connection-lifecycle";
import { TopicSubscriptionManager } from "./topic-subscription-manager";

export class WssConnectionOrchestrator {
	private readonly _lifecycle: WssConnectionLifecycle;
	private readonly _reconnector = new WssReconnector();
	private readonly _topicManager = new TopicSubscriptionManager();
	private readonly _queue: PendingPublishQueue;

	constructor(
		config: {
			wssUrl: string;
			tlsConfig?: Partial<TlsPaths>;
			serviceName: string;
			instanceId: string;
		},
		onMessage: (raw: string) => void,
		queue: PendingPublishQueue
	) {
		this._queue = queue;
		this._lifecycle = new WssConnectionLifecycle(config, {
			onOpen: () => this._onWsOpen(),
			onMessage: (raw: string) => onMessage(raw),
			onClose: (code: number, reason: Buffer) => this._onWsClose(code, reason),
			onError: (err: Error) => this._onWsError(err),
		});

		this._onConnect = () => {
			this._lifecycle.connect();
		};
	}

	private readonly _onConnect: () => void;

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
			this._scheduleReconnect();
		}
	}

	private _onWsOpen(): void {
		this._reconnector.reset();
		logger.info("WSS connected");

		if (this._topicManager.topics.length > 0) {
			this.send({
				type: "subscribe",
				topics: this._topicManager.topics,
			});
		}

		this._flushPending();
	}

	private _onWsClose(code: number, reason: Buffer): void {
		const reasonStr = reason?.toString() || "unknown";
		logger.warn("WSS disconnected", { code, reason: reasonStr });
		this._scheduleReconnect();
	}

	private _onWsError(err: Error): void {
		logger.warn("WSS error", { error: err.message });
		this._scheduleReconnect();
	}

	private _scheduleReconnect(): void {
		this._reconnector.scheduleReconnect(
			() => this._onConnect(),
			() => this._queue.drainToHttp()
		);
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

	private _flushPending(): void {
		this._queue.flush((data) => this.send(data));
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
