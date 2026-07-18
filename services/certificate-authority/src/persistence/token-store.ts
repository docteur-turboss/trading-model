import {
	DurationMs,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import { sha256Hex } from "@trading-model/crypto/crypto/hash-utils";
import type { Collection } from "mongodb";

export interface TokenUseRequest {
	token: string;
	serviceId: ServiceId;
	ttlMs?: DurationMs;
}

export interface UsedToken {
	tokenHash: string;
	serviceId: ServiceId;
	usedAt: Date;
	expiresAt: Date;
}

export class TokenStore {
	private _collection?: Collection<UsedToken>;
	private readonly _defaultTtlMs: DurationMs;

	constructor(collection?: Collection<UsedToken>, defaultTtlMs?: DurationMs) {
		if (collection) {
			this._collection = collection;
		}
		this._defaultTtlMs = defaultTtlMs ?? DurationMs.of(604_800_000);
	}

	setCollection(collection: Collection<UsedToken>): void {
		this._collection = collection;
	}

	private _buildUsedToken(
		hash: string,
		serviceId: ServiceId,
		ttl: DurationMs
	): UsedToken {
		return {
			tokenHash: hash,
			serviceId,
			usedAt: new Date(),
			expiresAt: new Date(Date.now() + ttl),
		};
	}

	private _handleInsertError(err: unknown): boolean | never {
		if ((err as Record<string, unknown>)?.code === 11000) {
			return false;
		}
		throw err;
	}

	async tryUseToken(request: TokenUseRequest): Promise<boolean> {
		if (!this._collection) {
			return true;
		}
		const { token, serviceId, ttlMs } = request;
		const ttl: DurationMs = ttlMs ?? this._defaultTtlMs;
		const hash = await this._hashToken(token);
		try {
			await this._collection.insertOne(
				this._buildUsedToken(hash, serviceId, ttl)
			);
			return true;
		} catch (err: unknown) {
			return this._handleInsertError(err);
		}
	}

	async markAsUsed(request: TokenUseRequest): Promise<void> {
		const ok = await this.tryUseToken(request);
		if (!ok) {
			throw new Error("Bootstrap token has already been used");
		}
	}

	async isUsed(token: string): Promise<boolean> {
		if (!this._collection) {
			return false;
		}
		const hash = await this._hashToken(token);
		const found = await this._collection.findOne({ tokenHash: hash });
		return found !== null;
	}

	private _hashToken(token: string): Promise<string> {
		return Promise.resolve(sha256Hex(token));
	}
}
