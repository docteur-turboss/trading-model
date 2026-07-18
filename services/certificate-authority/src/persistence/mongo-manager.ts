import { logger } from "@trading-model/common/config/logger";
import type { URLString } from "@trading-model/common/domain/primitives";
import { MongoConnectionManager } from "@trading-model/common/persistence/mongo-connection-manager";
import type { Db } from "mongodb";

function _extractDbName(uri: URLString): string {
	try {
		const path = new URL(uri).pathname.replace(/^\//, "");
		return path || "admin";
	} catch {
		return "admin";
	}
}

let _connection: MongoConnectionManager | null = null;

function _require(): MongoConnectionManager {
	if (!_connection) {
		throw new Error(
			"MONGO_MANAGER not initialized. Call MONGO_MANAGER.initialize() first."
		);
	}
	return _connection;
}

async function initialize(
	uri: URLString,
	poolSizeParam?: number
): Promise<void> {
	if (_connection) {
		return;
	}
	const dbName = _extractDbName(uri);
	const poolSize = poolSizeParam ?? 50;
	_connection = new MongoConnectionManager({
		uri,
		dbName,
		poolSize,
	});
	await _connection.getConnection();
	logger.info("MONGO_MANAGER initialized", {
		context: { poolSize, database: dbName },
	});
}

function getClient() {
	return _require().getClient();
}

function getDb(): Promise<Db> {
	// biome-ignore lint/suspicious/noExplicitAny: _require() result has unknown type, getDb() returns Db-like
	return _require().getDb() as any;
}

function isConnected(): boolean {
	return _connection?.isConnected() ?? false;
}

async function tryReconnect(): Promise<boolean> {
	if (!_connection) {
		return false;
	}
	await _connection.resetState();
	try {
		await _connection.getConnection();
		return true;
	} catch {
		logger.warn("MONGO_MANAGER reconnection failed");
		return false;
	}
}

async function close(): Promise<void> {
	if (!_connection) {
		return;
	}
	try {
		await _connection.close();
	} catch (err) {
		logger.warn("MONGO_MANAGER close error", { context: { err } });
	}
	_connection = null;
	logger.info("MONGO_MANAGER connection pool closed");
}

export const MONGO_MANAGER = {
	initialize,
	getClient,
	getDb,
	isConnected,
	get poolSize(): number {
		return _connection?.poolSize ?? 0;
	},
	tryReconnect,
	close,
};
