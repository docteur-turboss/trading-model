import { logger } from "@trading-model/common/config/logger";
import { HEARTBEAT } from "@trading-model/common/constants";
import type {
	DiscoveryWsMessage,
	DiscoveryWsMessageType,
} from "@trading-model/common/contracts/discovery-ws-message.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DefaultWsReconnector } from "@trading-model/common/ws/default-ws-reconnector";
import type WebSocket from "ws";
import { WsConnection } from "./ws-connection";

export type WsMessageType = DiscoveryWsMessageType;
export type WsMessage = DiscoveryWsMessage;
export type WsEventHandler = (message: WsMessage) => void;

export interface WebSocketClientOptions {
	url: string;
	reconnectIntervalMs?: number;
	subscribedServices?: string[];
	token?: string;
	maxReconnectAttempts?: number;
	onMessage?: WsEventHandler;
	onAuthFailure?: () => void;
}

export class WebSocketClient {
	private readonly _connection: WsConnection;
	private readonly _subscribedServices: string[];
	private readonly _eventHandler: WsEventHandler;
	private readonly _authFailureHandler: () => void;
	private readonly _reconnectHandler: DefaultWsReconnector;

	constructor(options: WebSocketClientOptions) {
		this._connection = new WsConnection(options.url, options.token);
		this._subscribedServices = options.subscribedServices ?? ["*"];
		this._eventHandler = options.onMessage ?? (() => {});
		this._authFailureHandler = options.onAuthFailure ?? (() => {});
		this._reconnectHandler = new DefaultWsReconnector({
			maxAttempts: options.maxReconnectAttempts ?? 10,
			config: {
				baseDelayMs: options.reconnectIntervalMs ?? 5000,
				maxDelayMs: options.reconnectIntervalMs ?? 5000,
				jitterMs: 0,
			},
			onReconnect: () => this.connect(),
		});
		this._connection.onOpen = () => this._onOpen();
		this._connection.onMessage = (data) => this._onMessage(data as WebSocket.Data);
		this._connection.onCloseHandler = () => this._onClose();
		this._connection.onError = (error) => this._onError(error);
	}

	connect(): void {
		if (this._connection.isConnected) {
			return;
		}
		this._connection.connect();
	}

	private _onOpen(): void {
		this._reconnectHandler.reset();
		logger.info("WebSocket connected to discovery server", {
			url: this._connection.url,
		});
		this.send("subscribe", { services: this._subscribedServices });
	}

	private _onMessage(data: WebSocket.Data): void {
		try {
			this._eventHandler(JSON.parse(data.toString()) as WsMessage);
		} catch (err) {
			logger.warn("Failed to parse WebSocket message", {
				data: data.toString(),
				err: normalizeError(err),
			});
		}
	}

	private _onClose(): void {
		if (this._connection.lastCloseCode === 4001) {
			this._authFailureHandler();
			return;
		}
		this._reconnectHandler.scheduleReconnect();
	}

	private _onError(error: Error): void {
		logger.error("WebSocket error", { error: normalizeError(error) });
	}

	send(type: WsMessageType, payload: Record<string, unknown>): boolean;
	send(data: unknown): boolean;
	send(
		typeOrData: WsMessageType | unknown,
		payload?: Record<string, unknown>
	): boolean {
		if (payload !== undefined) {
			return this._connection.send(
				JSON.stringify({ type: typeOrData as WsMessageType, payload })
			);
		}
		return this._connection.send(JSON.stringify(typeOrData));
	}

	disconnect(): void {
		this._reconnectHandler.cancel();
		this._connection.disconnect();
	}
	get isConnected(): boolean {
		return this._connection.isConnected;
	}
	getReconnectAttempts(): number {
		return this._reconnectHandler.attempt;
	}
	updateToken(token: string): void {
		this._connection.updateToken(token);
	}

	sendHeartbeat(identity: ServiceIdentity): boolean {
		return this.send(HEARTBEAT, {
			serviceName: identity.serviceName,
			instanceId: identity.instanceId,
		});
	}
}
