import { type Db, MongoClient } from "mongodb";

import { logger } from "./logger";

export class MongoConnectionState {
	private _client: MongoClient | null = null;
	private _db: Db | null = null;
	private _dbPromise: Promise<Db> | null = null;
	private _connected = false;

	get client(): MongoClient | null {
		return this._client;
	}

	set client(value: MongoClient | null) {
		this._client = value;
	}

	get db(): Db | null {
		return this._db;
	}

	set db(value: Db | null) {
		this._db = value;
	}

	get dbPromise(): Promise<Db> | null {
		return this._dbPromise;
	}

	set dbPromise(value: Promise<Db> | null) {
		this._dbPromise = value;
	}

	get connected(): boolean {
		return this._connected;
	}

	set connected(value: boolean) {
		this._connected = value;
	}

	registerMongoEvents(newClient: MongoClient): void {
		newClient.on("close", () => {
			this._connected = false;
		});
		newClient.on("reconnect", () => {
			this._connected = true;
		});
	}

	isConnected(): boolean {
		return this._connected && this._client !== null;
	}

	throwConnectError(lastError: Error | null): never {
		this._connected = false;
		throw lastError ?? new Error("Failed to connect to MongoDB after retries");
	}

	clearState(): void {
		this._client = null;
		this._db = null;
		this._dbPromise = null;
		this._connected = false;
	}
}
