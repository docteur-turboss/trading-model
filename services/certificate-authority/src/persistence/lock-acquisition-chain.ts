import type { DurationMs } from "@trading-model/common/domain/primitives";
import type { LockBackend, LockContext } from "./lock-backends";

export class LockAcquisitionChain {
	constructor(private readonly _backends: LockBackend[]) {}

	async acquire(
		context: LockContext,
		ttlMs: DurationMs
	): Promise<number | null> {
		for (const backend of this._backends) {
			const result = await backend.acquire(context, ttlMs);
			if (result !== null) {
				return result >= 0 ? result : null;
			}
		}
		return null;
	}

	async release(context: LockContext, token: number): Promise<void> {
		for (const backend of this._backends) {
			if (await backend.release(context, token)) {
				return;
			}
		}
	}
}
