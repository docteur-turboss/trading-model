import { createHash } from "node:crypto";

import { type Collection } from "mongodb";

export interface TokenUseRequest {
	token: string;
	serviceId: string;
	ttlMs?: number;
}

export interface UsedToken {
	tokenHash: string;
	serviceId: string;
	usedAt: Date;
	expiresAt: Date;
}

interface ICollection {
	insertOne(doc: UsedToken): Promise<{ acknowledged: boolean }>;
	findOne(filter: Record<string, unknown>): Promise<UsedToken | null>;
	createIndex(
		keys: Record<string, unknown>,
		options?: Record<string, unknown>
	): Promise<string>;
}

class NullCollection implements ICollection {
	async insertOne(): Promise<{ acknowledged: boolean }> {
		throw new Error("TokenStore not connected");
	}
	async findOne(): Promise<UsedToken | null> {
		throw new Error("TokenStore not connected");
	}
	async createIndex(): Promise<string> {
		throw new Error("TokenStore not connected");
	}
}

export class TokenStore {
	private _collection: ICollection = new NullCollection();
	private readonly _defaultTtlMs: number;

	constructor(
		collection?: Collection<UsedToken>,
		defaultTtlMs?: number
	) {
		if (collection) {
			this._collection = collection;
		}
		this._defaultTtlMs = defaultTtlMs ?? 604_800_000;
	}

	setCollection(collection: Collection<UsedToken>): void {
		this._collection = collection;
	}

	async tryUseToken(request: TokenUseRequest): Promise<boolean> {
		const { token, serviceId, ttlMs } = request;
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

	async markAsUsed(request: TokenUseRequest): Promise<void> {
		const ok = await this.tryUseToken(request);
		if (!ok) {
			throw new Error("Bootstrap token has already been used");
		}
	}

	async isUsed(token: string): Promise<boolean> {
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
