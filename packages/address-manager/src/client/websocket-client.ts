import { logger } from "@trading-model/common/config/logger";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import WebSocket from "ws";
import { WsReconnectHandler } from "./ws-reconnect-handler";

export type WsMessageType =
	| "heartbeat"
	| "register"
	| "subscribe"
	| "cache.invalidate";

export interface WsMessage {
	type: WsMessageType;
	payload: Record<string, unknown>;
}

export type WsEventHandler = (message: WsMessage) => void;

export interface WebSocketClientOptions {
	url: string;
	reconnectIntervalMs?: number;
	subscribedServices?: string[];
	token?: string;
	maxReconnectAttempts?: number;
}

export class WebSocketClient {
	private _ws: WebSocket | null = null;
	private readonly _baseUrl: string;
	private readonly _subscribedServices: string[];
	private _eventHandler: WsEventHandler | null = null;
	private _authFailureHandler: (() => void) | null = null;
	private _token?: string;
	private _reconnectHandler: WsReconnectHandler;

	constructor(options: WebSocketClientOptions) {
		this._baseUrl = options.url;
		this._token = options.token;
		this._subscribedServices = options.subscribedServices ?? ["*"];
		this._reconnectHandler = new WsReconnectHandler(
			options.maxReconnectAttempts ?? 10,
			options.reconnectIntervalMs ?? 5000,
			options.url,
			() => this.connect(),
		);
	}

	private get _url(): string {
		if (!this._token) {
			return this._baseUrl;
		}
		const url = new URL(this._baseUrl);
		url.searchParams.set("token", this._token);
		return url.toString();
	}

	onMessage(handler: WsEventHandler): void {
		this._eventHandler = handler;
	}

	private _setupWsHandlers(): void {
		if (!this._ws) {
			return;
		}
		this._ws.on("open", () => this._onOpen());
		this._ws.on("message", (data: WebSocket.Data) => this._onMessage(data));
		this._ws.on("close", (code: number) => this._onClose(code));
		this._ws.on("error", (error: Error) => this._onError(error));
	}

	connect(): void {
		if (this._ws) {
			return;
		}
		try {
			this._ws = new WebSocket(this._url);
			this._setupWsHandlers();
		} catch (error) {
			logger.error("WebSocket connection failed", {
				error: normalizeError(error),
			});
			this._ws = null;
			this._reconnectHandler.schedule();
		}
	}

	private _onOpen(): void {
		this._reconnectHandler.resetAttempts();
		logger.info("WebSocket connected to discovery server", {
			url: this._url,
		});
		this.send("subscribe", { services: this._subscribedServices });
	}

	private _onMessage(data: WebSocket.Data): void {
		try {
			const message = JSON.parse(data.toString()) as WsMessage;
			this._eventHandler?.(message);
		} catch (err) {
			logger.warn("Failed to parse WebSocket message", {
				data: data.toString(),
				err: normalizeError(err),
			});
		}
	}

	private _onClose(code: number): void {
		this._ws = null;
		if (code === 4001) {
			this._authFailureHandler?.();
			return;
		}
		this._reconnectHandler.schedule();
	}

	private _onError(error: Error): void {
		logger.error("WebSocket error", { error: normalizeError(error) });
	}

	send(type: WsMessageType, payload: Record<string, unknown>): boolean;
	send(data: unknown): boolean;
	send(typeOrData: WsMessageType | unknown, payload?: Record<string, unknown>): boolean {
		if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
			return false;
		}

		if (arguments.length >= 2) {
			const message: WsMessage = { type: typeOrData as WsMessageType, payload: payload! };
			this._ws.send(JSON.stringify(message));
		} else {
			this._ws.send(JSON.stringify(typeOrData));
		}
		return true;
	}

	disconnect(): void {
		this._reconnectHandler.cancel();
		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}
	}

	get isConnected(): boolean {
		return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
	}

	getReconnectAttempts(): number {
		return this._reconnectHandler.attempt;
	}

	onAuthFailure(handler: () => void): void {
		this._authFailureHandler = handler;
	}

	updateToken(token: string): void {
		this._token = token;
	}

	sendHeartbeat(identity: ServiceIdentity): boolean {
		return this.send("heartbeat", {
			serviceName: identity.serviceName,
			instanceId: identity.instanceId,
		});
	}
}
