import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";

import { WssConnection } from "./wss-connection";
import { WssReconnector } from "./wss-reconnector";
import { PendingPublishQueue } from "./pending-publish-queue";

export class WssConnectionOrchestrator {
	private readonly _connection: WssConnection;
	private readonly _reconnector = new WssReconnector();
	private readonly _wsUrl: string;
	private readonly _serviceName: string;
	private readonly _instanceId: string;
	private _subscribedTopics: string[] = [];

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
		this._connection = new WssConnection(config.tlsConfig);
		this._wsUrl = config.wssUrl;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;

		const callbacks = {
			onOpen: () => this._onWsOpen(),
			onMessage: (raw: string) => onMessage(raw),
			onClose: (code: number, reason: Buffer) => this._onWsClose(code, reason),
			onError: (err: Error) => this._onWsError(err),
		};

		this._onConnect = () => {
			const url = this._buildUrl();
			this._connection.connect(url, callbacks);
		};
	}

	private readonly _onConnect: () => void;

	private _buildUrl(): string {
		const url = new URL(this._wsUrl);
		url.searchParams.set("service", this._serviceName);
		url.searchParams.set("instance", this._instanceId);
		return url.toString();
	}

	get builtUrl(): string {
		return this._buildUrl();
	}

	connect(topics: string[]): void {
		this._subscribedTopics = topics;
		this._reconnector.shouldReconnect = true;
		this._connectWs();
	}

	private _connectWs(): void {
		logger.info("WSS connecting", {
			url: this._buildUrl(),
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

		if (this._subscribedTopics.length > 0) {
			this.send({
				type: "subscribe",
				topics: this._subscribedTopics,
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
		return this._connection.isConnected;
	}

	send(data: unknown): boolean {
		return this._connection.send(data);
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._connection.disconnect(closeCode, reason);
	}

	private _flushPending(): void {
		this._queue.flush((data) => this.send(data));
	}

	addTopics(topics: string[]): void {
		this._subscribedTopics = [
			...new Set([...this._subscribedTopics, ...topics]),
		];
	}

	removeTopics(topics: string[]): void {
		this._subscribedTopics = this._subscribedTopics.filter(
			(topic) => !topics.includes(topic)
		);
	}

	get shouldReconnect(): boolean {
		return this._reconnector.shouldReconnect;
	}

	stop(): void {
		this._reconnector.stop();
	}
}
