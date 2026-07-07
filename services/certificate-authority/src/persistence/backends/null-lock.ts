import type { LockBackend, LockContext } from "./lock-backend-interface";

export class NullLockBackend implements LockBackend {
	acquire(_context: LockContext, _ttlMs: number): Promise<number | null> {
		return Promise.resolve(null);
	}

	release(_context: LockContext, _fencingToken: number): Promise<boolean> {
		return Promise.resolve(false);
	}

	verifyOwnership(
		_context: LockContext,
		_fencingToken: number
	): Promise<number> {
		return Promise.resolve(-1);
	}

	disconnect(): void {}
}
