import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import WebSocket from "ws";

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
	private readonly _reconnectIntervalMs: number;
	private readonly _maxReconnectAttempts: number;
	private readonly _subscribedServices: string[];
	private _shouldReconnect = true;
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _eventHandler: WsEventHandler | null = null;
	private _authFailureHandler: (() => void) | null = null;
	private _token?: string;

	constructor(options: WebSocketClientOptions) {
		this._baseUrl = options.url;
		this._token = options.token;
		this._reconnectIntervalMs = options.reconnectIntervalMs ?? 5000;
		this._maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
		this._subscribedServices = options.subscribedServices ?? ["*"];
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

	connect(): void {
		if (this._ws) {
			return;
		}

		try {
			this._ws = new WebSocket(this._url);
			this._ws.on("open", () => this._onOpen());
			this._ws.on("message", (data: WebSocket.Data) => this._onMessage(data));
			this._ws.on("close", (code: number) => this._onClose(code));
			this._ws.on("error", (error: Error) => this._onError(error));
		} catch (error) {
			logger.error("WebSocket connection failed", {
				error: normalizeError(error),
			});
			this._ws = null;
			this._scheduleReconnect();
		}
	}

	private _onOpen(): void {
		this._wsReconnectState.attempt = 0;
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
		this._scheduleReconnect();
	}

	private _onError(error: Error): void {
		logger.error("WebSocket error", { error: normalizeError(error) });
	}

	send(type: WsMessageType, payload: Record<string, unknown>): boolean {
		if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
			return false;
		}

		const message: WsMessage = { type, payload };
		this._ws.send(JSON.stringify(message));
		return true;
	}

	disconnect(): void {
		this._shouldReconnect = false;
		this._wsReconnectState.destroyed = true;
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}
	}

	isConnected(): boolean {
		return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
	}

	private _scheduleReconnect(): void {
		if (!this._shouldReconnect) {
			return;
		}
		if (this._wsReconnectState.attempt >= this._maxReconnectAttempts) {
			logger.warn("WebSocket max reconnect attempts reached", {
				url: this._url,
				attempts: this._wsReconnectState.attempt,
			});
			return;
		}
		scheduleWsReconnect({
			state: this._wsReconnectState,
			config: {
				baseDelayMs: this._reconnectIntervalMs,
				maxDelayMs: this._reconnectIntervalMs,
				jitterMs: 0,
			},
			onReconnect: () => this.connect(),
			logger,
		});
	}

	getReconnectAttempts(): number {
		return this._wsReconnectState.attempt;
	}

	onAuthFailure(handler: () => void): void {
		this._authFailureHandler = handler;
	}

	updateToken(token: string): void {
		this._token = token;
	}

	sendHeartbeat(_serviceName: string, _instanceId: string): boolean {
		return this.send("heartbeat", {
			serviceName: _serviceName,
			instanceId: _instanceId,
		});
	}
}
