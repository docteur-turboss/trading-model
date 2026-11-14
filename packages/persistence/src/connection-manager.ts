import type { BackoffConfig } from "@trading-model/common/utils/backoff-config";
import { normalizeError } from "@trading-model/common/utils/errors";
import { retryWithBackoff } from "@trading-model/common/utils/retry";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { DurationMs } from "@trading-model/primitives/primitives";

export interface ConnectionManagerOptions extends BackoffConfig {
	maxRetries: number;
}

export const DEFAULT_CONNECTION_OPTIONS: ConnectionManagerOptions = {
	maxRetries: 10,
	baseDelayMs: DurationMs.of(1000),
	maxDelayMs: DurationMs.of(30000),
};

export class ConnectionManager<_TConnection> {
	protected _connection: _TConnection | null = null;
	protected _connectionPromise: Promise<_TConnection> | null = null;
	protected _connected = false;
	private readonly _connectFn: () => Promise<_TConnection>;
	private readonly _disconnectFn: (conn: _TConnection) => Promise<void>;
	protected readonly _options: ConnectionManagerOptions;

	constructor(
		connectFn: () => Promise<_TConnection>,
		disconnectFn: (conn: _TConnection) => Promise<void>,
		options?: Partial<ConnectionManagerOptions>
	) {
		this._connectFn = connectFn;
		this._disconnectFn = disconnectFn;
		this._options = { ...DEFAULT_CONNECTION_OPTIONS, ...options };
	}

	getConnection(): Promise<_TConnection> {
		if (this._connection) {
			return Promise.resolve(this._connection);
		}
		this._connectionPromise ??= this._connectWithRetry();
		return this._connectionPromise;
	}

	protected async _connectWithRetry(): Promise<_TConnection> {
		const { result: conn, lastError } = await retryWithBackoff(
			() => this._connectFn(),
			this._options
		);
		if (!conn) {
			throw lastError ?? new Error("Failed to connect after retries");
		}
		this._connection = conn;
		this._connected = true;
		return conn;
	}

	getClient(): _TConnection | null {
		return this._connection;
	}

	isConnected(): boolean {
		return this._connected && this._connection !== null;
	}

	async resetState(): Promise<void> {
		if (this._connection) {
			await this._tryDisconnect(this._connection);
		}
		this._clearState();
	}

	async close(): Promise<void> {
		if (this._connection) {
			await this._tryDisconnect(this._connection);
			this._clearState();
		}
	}

	/** The connection is dropped either way; a failed disconnect may leak a socket. */
	private async _tryDisconnect(connection: _TConnection): Promise<void> {
		try {
			await this._disconnectFn(connection);
		} catch (err) {
			getLogger().warn("Disconnect failed, dropping the connection", {
				error: normalizeError(err).message,
			});
		}
	}

	protected _clearState(): void {
		this._connection = null;
		this._connectionPromise = null;
		this._connected = false;
	}
}
