import { logger } from "@trading-model/common/config/logger";
import type {
	DiscoveryWsMessage,
	DiscoveryWsMessageType,
} from "@trading-model/common/contracts/discovery-ws-message.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import type WebSocket from "ws";
import { WsConnection } from "./ws-connection";
import { WsReconnectHandler } from "./ws-reconnect-handler";

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
	private readonly _reconnectHandler: WsReconnectHandler;

	constructor(options: WebSocketClientOptions) {
		this._connection = new WsConnection(options.url, options.token);
		this._subscribedServices = options.subscribedServices ?? ["*"];
		this._eventHandler = options.onMessage ?? (() => {});
		this._authFailureHandler = options.onAuthFailure ?? (() => {});
		this._reconnectHandler = new WsReconnectHandler(
			options.maxReconnectAttempts ?? 10,
			options.reconnectIntervalMs ?? 5000,
			options.url,
			() => this.connect()
		);
	}

	private _setupWsHandlers(ws: WebSocket): void {
		ws.on("open", () => this._onOpen());
		ws.on("message", (data: WebSocket.Data) => this._onMessage(data));
		ws.on("close", (code: number) => this._onClose(code));
		ws.on("error", (error: Error) => this._onError(error));
	}

	connect(): void {
		if (this._connection.isConnected) {
			return;
		}
		const ws = this._connection.connect();
		if (ws) {
			this._setupWsHandlers(ws);
		} else {
			this._reconnectHandler.scheduleReconnect();
		}
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

	private _onClose(code: number): void {
		this._connection.onClose();
		if (code === 4001) {
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
		if (arguments.length >= 2) {
			return this._connection.send(
				JSON.stringify({ type: typeOrData as WsMessageType, payload: payload! })
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
		return this.send("heartbeat", {
			serviceName: identity.serviceName,
			instanceId: identity.instanceId,
		});
	}
}
