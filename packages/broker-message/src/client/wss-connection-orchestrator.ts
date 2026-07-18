import { logger } from "@trading-model/common/config/logger";
import {
	DurationMs,
	type Topic,
} from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DefaultWsReconnector } from "@trading-model/common/ws/default-ws-reconnector";
import type { PendingPublishQueue } from "./pending-publish-queue";
import type { WssClientConfig } from "./wss-connection-lifecycle";
import { WssConnectionLifecycle } from "./wss-connection-lifecycle";

export class WssConnectionOrchestrator {
	private readonly _lifecycle: WssConnectionLifecycle;
	private readonly _reconnector = new DefaultWsReconnector({
		maxAttempts: 20,
		config: {
			baseDelayMs: DurationMs.of(1000),
			maxDelayMs: DurationMs.of(30000),
			jitterMs: DurationMs.of(1000),
		},
		onReconnect: () => {},
		onPermanentFallback: () => this._queue.drainToHttp(),
	});
	private _topics: Topic[] = [];
	private readonly _onConnect: () => void;

	constructor(
		config: WssClientConfig,
		onMessage: (raw: string) => void,
		private readonly _queue: PendingPublishQueue
	) {
		this._lifecycle = new WssConnectionLifecycle(config, {
			onOpen: () => {
				this._reconnector.reset();
				logger.info("WSS connected");
				if (this._topics.length > 0) {
					this._lifecycle.send({
						type: "subscribe",
						topics: this._topics,
					});
				}
				this._queue.flush((data) => this._lifecycle.send(data));
			},
			onMessage: (raw: string) => onMessage(raw),
			onClose: () => logger.warn("WSS disconnected"),
			onError: (err: Error) => logger.warn("WSS error", { error: err.message }),
		});
		this._onConnect = () => {
			this._lifecycle.connect();
		};
	}

	get builtUrl(): string {
		return this._lifecycle.builtUrl;
	}

	connect(topics: Topic[]): void {
		this._topics = topics;
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
			this._reconnector.scheduleReconnect(() => this._onConnect());
		}
	}

	isConnected(): boolean {
		return this._lifecycle.isConnected;
	}

	send(data: unknown): boolean {
		return this._lifecycle.send(data);
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._lifecycle.disconnect(closeCode, reason);
	}

	addTopics(topics: Topic[]): void {
		this._topics = [...new Set([...this._topics, ...topics])];
	}

	removeTopics(topics: Topic[]): void {
		this._topics = this._topics.filter((topic) => !topics.includes(topic));
	}

	get shouldReconnect(): boolean {
		return this._reconnector.shouldReconnect;
	}

	stop(): void {
		this._reconnector.stop();
	}
}
