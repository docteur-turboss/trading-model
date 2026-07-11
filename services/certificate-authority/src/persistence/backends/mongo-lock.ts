import type { DurationMs } from "@trading-model/common/domain/primitives";
import type { Collection } from "mongodb";
import { MongoLockExecutor } from "../mongo-lock-executor";
import type {
	LockBackend,
	LockContext,
	LockDocument,
} from "./lock-backend-interface";

export class MongoLockBackend implements LockBackend {
	private _connected = false;
	private readonly _executor: MongoLockExecutor;

	constructor(
		private readonly _collection: () => Collection<LockDocument> | null,
		private readonly _onDisconnect: () => void
	) {
		this._executor = new MongoLockExecutor(this._collection, () => {
			this._connected = false;
			this._onDisconnect();
		});
	}

	setConnected(value: boolean): void {
		this._connected = value;
	}

	async acquire(
		context: LockContext,
		ttlMs: DurationMs
	): Promise<number | null> {
		if (!this._connected) {
			return null;
		}
		const result = await this._executor.acquire(context, ttlMs);
		if (result !== null) {
			return result;
		}
		return this._connected ? -1 : null;
	}

	async release(context: LockContext, fencingToken: number): Promise<boolean> {
		if (!this._connected) {
			return false;
		}
		return await this._executor.release(context, fencingToken);
	}

	async verifyOwnership(
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		if (!this._connected) {
			return -1;
		}
		return await this._executor.verifyOwnership(context, fencingToken);
	}
}
