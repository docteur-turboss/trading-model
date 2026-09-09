import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	DurationMs,
	type InstanceId,
	type Topic,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DefaultWsReconnector } from "@trading-model/common/ws/default-ws-reconnector";
import {
	WssConnection,
	type WssConnectionEvents,
} from "../../infrastructure/wss-connection";
import type { PendingPublishQueue } from "./pending-publish-queue";

export interface WssClientConfig {
	wssUrl: string;
	tlsConfig?: Partial<TlsPaths>;
	serviceName: ServiceInstanceName;
	instanceId: InstanceId;
}

export class WssConnectionOrchestrator {
	private readonly _connection: WssConnection;
	private readonly _builtUrl: string;
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
		this._builtUrl = this._buildUrl(
			config.wssUrl,
			config.serviceName,
			config.instanceId
		);
		this._connection = new WssConnection(this._builtUrl, config.tlsConfig);
		const callbacks: WssConnectionEvents = {
			onOpen: () => {
				this._reconnector.reset();
				logger.info("WSS connected");
				if (this._topics.length > 0) {
					this._connection.send({
						type: "subscribe",
						topics: this._topics,
					});
				}
				this._queue.flush((data) => this._connection.send(data));
			},
			onMessage: (raw: string) => onMessage(raw),
			onClose: () => logger.warn("WSS disconnected"),
			onError: (err: Error) => logger.warn("WSS error", { error: err.message }),
		};
		this._connection.onOpen = () => callbacks.onOpen?.();
		this._connection.onMessage = (data) =>
			callbacks.onMessage?.(data as string);
		this._connection.onCloseHandler = () =>
			callbacks.onClose?.(0, Buffer.alloc(0));
		this._connection.onError = (err) => callbacks.onError?.(err);
		this._onConnect = () => {
			this._connection.connect();
		};
	}

	get builtUrl(): string {
		return this._builtUrl;
	}

	connect(topics: Topic[]): void {
		this._topics = topics;
		this._reconnector.shouldReconnect = true;
		this._connectWs();
	}

	private _connectWs(): void {
		logger.info("WSS connecting", {
			url: this.builtUrl,
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
		return this._connection.isConnected;
	}

	send(data: unknown): boolean {
		return this._connection.send(data);
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._connection.disconnect(closeCode, reason);
	}

	private _buildUrl(
		wssUrl: string,
		serviceName: ServiceInstanceName,
		instanceId: InstanceId
	): string {
		const url = new URL(wssUrl);
		url.searchParams.set("service", serviceName);
		url.searchParams.set("instance", instanceId);
		return url.toString();
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
