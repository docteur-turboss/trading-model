import { logger } from "@trading-model/common/config/logger";
import {
	createPoolOptions,
	resolvePoolSize,
} from "@trading-model/common/persistence/mongo-utils";
import { type Db, MongoClient } from "mongodb";

let _client: MongoClient | null = null;
let _db: Db | null = null;
let _uri = "";
let _poolSize = 50;
let _initialized = false;

async function initialize(
	uriParam: string,
	poolSizeParam?: number
): Promise<void> {
	if (_initialized) {
		return;
	}
	_uri = uriParam;
	_poolSize = resolvePoolSize(poolSizeParam);
	_client = new MongoClient(_uri, createPoolOptions(_poolSize));
	await _client.connect();
	_db = _client.db();
	_initialized = true;
	logger.info("MONGO_MANAGER initialized", {
		context: { poolSize: _poolSize, database: _db.databaseName },
	});
}

function getClient(): MongoClient {
	if (!_client) {
		throw new Error(
			"MONGO_MANAGER not initialized. Call MONGO_MANAGER.initialize() first."
		);
	}
	return _client;
}

function getDb(): Db {
	if (!_db) {
		throw new Error(
			"MONGO_MANAGER not initialized. Call MONGO_MANAGER.initialize() first."
		);
	}
	return _db;
}

function getPoolSize(): number {
	return _poolSize;
}

function isInitialized(): boolean {
	return _initialized;
}

async function _closeAndReset(): Promise<void> {
	if (!_client) {
		return;
	}
	try {
		await _client.close();
	} catch {}
	_client = null;
	_db = null;
	_initialized = false;
}

async function tryReconnect(): Promise<boolean> {
	await _closeAndReset();
	try {
		await initialize(_uri, _poolSize);
		return true;
	} catch {
		logger.warn("MONGO_MANAGER reconnection failed");
		return false;
	}
}

async function close(): Promise<void> {
	if (_client) {
		try {
			await _client.close();
		} catch (err) {
			logger.warn("MONGO_MANAGER close error", { context: { err } });
		}
		_client = null;
		_db = null;
		_initialized = false;
		logger.info("MONGO_MANAGER connection pool closed");
	}
}

export const MONGO_MANAGER = {
	initialize,
	getClient,
	getDb,
	getPoolSize,
	isInitialized,
	tryReconnect,
	close,
};
