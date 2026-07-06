import { logger } from "@trading-model/common/config/logger";
import type { Collection } from "mongodb";
import type { LockBackend, LockContext, LockDocument } from "./lock-backends";
import { MongoLockRepository } from "./mongo-lock-repository";

export class MongoLockBackend implements LockBackend {
	private _connected = false;
	private readonly _repository = new MongoLockRepository();

	constructor(
		private readonly _collection: () => Collection<LockDocument> | null,
		private readonly _onDisconnect: () => void
	) {}

	setConnected(value: boolean): void {
		this._connected = value;
	}

	async acquire(
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		if (!this._connected) {
			return null;
		}
		const collection = this._collection();
		if (!collection) {
			return null;
		}
		try {
			return await this._repository.acquire(collection, context, ttlMs);
		} catch (err) {
			logger.warn("MongoDB lock acquire failed", { context: { err } });
			this._connected = false;
			this._onDisconnect();
			return null;
		}
	}

	async release(
		context: LockContext,
		fencingToken: number
	): Promise<boolean> {
		if (!this._connected) {
			return false;
		}
		const collection = this._collection();
		if (!collection) {
			return false;
		}
		try {
			await this._repository.release(collection, context, fencingToken);
			return true;
		} catch {
			this._connected = false;
			this._onDisconnect();
			return false;
		}
	}

	async verifyOwnership(
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		if (!this._connected) {
			return -1;
		}
		const collection = this._collection();
		if (!collection) {
			return -1;
		}
		try {
			return await this._repository.verifyOwnership(collection, context, fencingToken);
		} catch {
			this._connected = false;
			this._onDisconnect();
			return -1;
		}
	}
}
