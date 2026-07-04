import { createHash } from "node:crypto";

import { type Collection, type Db, MongoClient } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";

export interface UsedToken {
	tokenHash: string;
	serviceId: string;
	usedAt: Date;
	expiresAt: Date;
}

export class TokenStore {
	private _client: MongoClient | null = null;
	private _collection: Collection<UsedToken> | null = null;
	private readonly _uri: string;
	private readonly _dbName: string;
	private readonly _defaultTtlMs: number;

	constructor(uri: string, dbName?: string, defaultTtlMs?: number) {
		this._uri = uri;
		this._dbName = dbName ?? "certificate-authority";
		this._defaultTtlMs = defaultTtlMs ?? 604_800_000; // 7 days default TTL
	}

	async connect(): Promise<void> {
		if (MONGO_MANAGER.isInitialized()) {
			const db: Db = MONGO_MANAGER.getDb();
			this._collection = db.collection<UsedToken>("used_tokens");
			await this._createIndexes();
			return;
		}
		this._client = new MongoClient(this._uri);
		await this._client.connect();
		const db: Db = this._client.db(this._dbName);
		this._collection = db.collection<UsedToken>("used_tokens");

		await this._createIndexes();
	}

	async disconnect(): Promise<void> {
		if (!MONGO_MANAGER.isInitialized()) {
			await this._client?.close();
		}
		this._client = null;
		this._collection = null;
	}

	private async _createIndexes(): Promise<void> {
		if (!this._collection) {
			return;
		}
		await this._collection.createIndex(
			{ expiresAt: 1 },
			{ expireAfterSeconds: 0 }
		);
		await this._collection.createIndex({ tokenHash: 1 }, { unique: true });
	}

	async tryUseToken(
		token: string,
		serviceId: string,
		ttlMs?: number
	): Promise<boolean> {
		if (!this._collection) {
			throw new Error("TokenStore not connected");
		}

		const ttl = ttlMs ?? this._defaultTtlMs;
		const hash = await this._hashToken(token);

		try {
			await this._collection.insertOne({
				tokenHash: hash,
				serviceId,
				usedAt: new Date(),
				expiresAt: new Date(Date.now() + ttl),
			});
			return true;
		} catch (err: unknown) {
			if ((err as Record<string, unknown>)?.code === 11000) {
				return false;
			}
			throw err;
		}
	}

	async markAsUsed(
		token: string,
		serviceId: string,
		ttlMs?: number
	): Promise<void> {
		const ok = await this.tryUseToken(token, serviceId, ttlMs);
		if (!ok) {
			throw new Error("Bootstrap token has already been used");
		}
	}

	async isUsed(token: string): Promise<boolean> {
		if (!this._collection) {
			throw new Error("TokenStore not connected");
		}

		const hash = await this._hashToken(token);
		const found = await this._collection.findOne({ tokenHash: hash });
		return found !== null;
	}

	private _hashToken(token: string): Promise<string> {
		return Promise.resolve(
			createHash("sha256").update(token, "utf8").digest("hex")
		);
	}
}
