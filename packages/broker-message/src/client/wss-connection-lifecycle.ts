import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type { IWsConnection } from "@trading-model/common/ws/i-ws-connection";
import { WssConnection, type WssConnectionEvents } from "./wss-connection";

export interface WssClientConfig {
	wssUrl: string;
	tlsConfig?: Partial<TlsPaths>;
	serviceName: ServiceInstanceName;
	instanceId: InstanceId;
}

export type WsConnectionLifecycleCallbacks = WssConnectionEvents;

export class WssConnectionLifecycle implements IWsConnection {
	private readonly _connection: WssConnection;
	private readonly _wsUrl: string;
	private readonly _serviceName: ServiceInstanceName;
	private readonly _instanceId: InstanceId;
	private readonly _callbacks: WsConnectionLifecycleCallbacks;

	onCloseHandler?: () => void;
	onOpen?: () => void;
	onMessage?: (data: unknown) => void;
	onError?: (err: Error) => void;

	constructor(
		config: WssClientConfig,
		callbacks: WsConnectionLifecycleCallbacks
	) {
		this._connection = new WssConnection(config.tlsConfig);
		this._connection.onCloseHandler = () => {
			this._callbacks.onClose(0, Buffer.alloc(0));
			this.onCloseHandler?.();
		};
		this._wsUrl = config.wssUrl;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;
		this._callbacks = callbacks;
	}

	get builtUrl(): string {
		return this._buildUrl();
	}

	private _setupOpenHandler(): void {
		this._connection.onOpen = () => {
			this._callbacks.onOpen();
			this.onOpen?.();
		};
	}

	private _setupMessageHandler(): void {
		this._connection.onMessage = (data) => {
			this._callbacks.onMessage(data as string);
			this.onMessage?.(data);
		};
	}

	private _setupErrorHandler(): void {
		this._connection.onError = (err) => {
			this._callbacks.onError(err);
			this.onError?.(err);
		};
	}

	connect(): void {
		this._setupOpenHandler();
		this._setupMessageHandler();
		this._setupErrorHandler();
		this._connection.setUrl(this._buildUrl());
		this._connection.connect();
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._connection.disconnect(closeCode, reason);
	}

	send(data: unknown): boolean {
		return this._connection.send(data);
	}

	get isConnected(): boolean {
		return this._connection.isConnected;
	}

	private _buildUrl(): string {
		const url = new URL(this._wsUrl);
		url.searchParams.set("service", this._serviceName);
		url.searchParams.set("instance", this._instanceId);
		return url.toString();
	}
}
