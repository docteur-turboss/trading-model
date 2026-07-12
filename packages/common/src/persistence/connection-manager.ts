import { DurationMs } from "../domain/primitives";
import type { BackoffConfig } from "../utils/backoff-config";
import { type RetryResult, retryWithBackoff } from "../utils/retry";

export interface ConnectionFactory<_TConnection> {
	connect(): Promise<_TConnection>;
}

export interface ConnectionManagerOptions extends BackoffConfig {
	maxRetries: number;
}

export const DEFAULT_CONNECTION_OPTIONS: ConnectionManagerOptions = {
	maxRetries: 10,
	baseDelayMs: DurationMs.of(1000),
	maxDelayMs: DurationMs.of(30000),
};

function _executeRetry<_TResult>(
	connectFn: () => Promise<_TResult>,
	options: ConnectionManagerOptions
): Promise<RetryResult<_TResult>> {
	return retryWithBackoff(connectFn, {
		maxRetries: options.maxRetries,
		baseDelayMs: options.baseDelayMs,
		maxDelayMs: options.maxDelayMs,
	});
}

function _throwConnectFailed<_TResult>(lastError: Error | null): _TResult {
	throw lastError ?? new Error("Failed to connect after retries");
}

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

	async getConnection(): Promise<_TConnection> {
		if (this._connection) {
			return this._connection;
		}
		const existingConn =
			this._connectionPromise === null ? null : await this._connectionPromise;
		if (existingConn) {
			return existingConn;
		}
		this._connectionPromise = this._connectWithRetry();
		return this._connectionPromise;
	}

	protected async _connectWithRetry(): Promise<_TConnection> {
		const { result: conn, lastError } = await _executeRetry(
			() => this._connectFn(),
			this._options
		);
		if (!conn) {
			return _throwConnectFailed(lastError);
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
			try {
				await this._disconnectFn(this._connection);
			} catch {}
		}
		this._clearState();
	}

	async close(): Promise<void> {
		if (this._connection) {
			try {
				await this._disconnectFn(this._connection);
			} catch {}
			this._clearState();
		}
	}

	protected _clearState(): void {
		this._connection = null;
		this._connectionPromise = null;
		this._connected = false;
	}
}
