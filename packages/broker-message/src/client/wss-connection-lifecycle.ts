import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { WssConnection } from "./wss-connection";

export interface WsConnectionLifecycleCallbacks {
	onOpen: () => void;
	onMessage: (raw: string) => void;
	onClose: (code: number, reason: Buffer) => void;
	onError: (err: Error) => void;
}

export class WssConnectionLifecycle {
	private readonly _connection: WssConnection;
	private readonly _wsUrl: string;
	private readonly _serviceName: string;
	private readonly _instanceId: string;
	private _connected = false;
	private readonly _callbacks: WsConnectionLifecycleCallbacks;

	constructor(
		config: {
			wssUrl: string;
			tlsConfig?: Partial<TlsPaths>;
			serviceName: string;
			instanceId: string;
		},
		callbacks: WsConnectionLifecycleCallbacks
	) {
		this._connection = new WssConnection(config.tlsConfig);
		this._wsUrl = config.wssUrl;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;
		this._callbacks = callbacks;
	}

	get builtUrl(): string {
		return this._buildUrl();
	}

	connect(): void {
		const url = this._buildUrl();
		this._connection.connect(url, {
			onOpen: () => {
				this._connected = true;
				this._callbacks.onOpen();
			},
			onMessage: (raw) => this._callbacks.onMessage(raw),
			onClose: (code, reason) => {
				this._connected = false;
				this._callbacks.onClose(code, reason);
			},
			onError: (err) => {
				this._connected = false;
				this._callbacks.onError(err);
			},
		});
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._connection.disconnect(closeCode, reason);
		this._connected = false;
	}

	send(data: unknown): boolean {
		return this._connection.send(data);
	}

	isConnected(): boolean {
		return this._connected;
	}

	private _buildUrl(): string {
		const url = new URL(this._wsUrl);
		url.searchParams.set("service", this._serviceName);
		url.searchParams.set("instance", this._instanceId);
		return url.toString();
	}
}
