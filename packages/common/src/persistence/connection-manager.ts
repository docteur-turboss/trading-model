import { retryWithBackoff, type RetryResult } from "../utils/retry";

export interface ConnectionFactory<T> {
	connect(): Promise<T>;
}

export interface ConnectionManagerOptions {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
}

export const DEFAULT_CONNECTION_OPTIONS: ConnectionManagerOptions = {
	maxRetries: 10,
	baseDelayMs: 1000,
	maxDelayMs: 30000,
};

function _executeRetry<T>(
	connectFn: () => Promise<T>,
	options: ConnectionManagerOptions
): Promise<RetryResult<T>> {
	return retryWithBackoff(connectFn, {
		maxRetries: options.maxRetries,
		baseDelayMs: options.baseDelayMs,
		maxDelayMs: options.maxDelayMs,
	});
}

function _throwConnectFailed<T>(lastError: Error | null): T {
	throw lastError ?? new Error("Failed to connect after retries");
}

export class ConnectionManager<T> {
	protected _connection: T | null = null;
	protected _connectionPromise: Promise<T> | null = null;
	protected _connected = false;
	private readonly _connectFn: () => Promise<T>;
	private readonly _disconnectFn: (conn: T) => Promise<void>;
	protected readonly _options: ConnectionManagerOptions;

	constructor(
		connectFn: () => Promise<T>,
		disconnectFn: (conn: T) => Promise<void>,
		options?: Partial<ConnectionManagerOptions>
	) {
		this._connectFn = connectFn;
		this._disconnectFn = disconnectFn;
		this._options = { ...DEFAULT_CONNECTION_OPTIONS, ...options };
	}

	async getConnection(): Promise<T> {
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

	protected async _connectWithRetry(): Promise<T> {
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
