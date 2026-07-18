import type {
	DurationMs,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { NonceContext } from "./nonce-persistence.interface";

interface NonceEntry extends NonceContext {
	createdAt: number;
}

export class NonceCache {
	private readonly _l1 = new Map<string, NonceEntry>();
	private readonly _cleanupTimer = new TimerHandle();

	constructor(private readonly _ttlMs: DurationMs) {
		this._startCleanup();
	}

	get size(): number {
		return this._l1.size;
	}

	set(nonce: string, serviceId: ServiceId): void {
		this._l1.set(nonce, { nonce, serviceId, createdAt: Date.now() });
	}

	get(nonce: string): NonceEntry | undefined {
		return this._l1.get(nonce);
	}

	delete(nonce: string): void {
		this._l1.delete(nonce);
	}

	clear(): void {
		this._l1.clear();
	}

	isExpired(createdAt: number): boolean {
		return Date.now() - createdAt > this._ttlMs;
	}

	destroy(): void {
		this._cleanupTimer.stop();
		this._l1.clear();
	}

	loadFromPersister(
		entries: Array<{ nonce: string; serviceId: ServiceId; createdAt: Date }>
	): void {
		for (const doc of entries) {
			this._l1.set(doc.nonce, {
				nonce: doc.nonce,
				serviceId: doc.serviceId,
				createdAt: doc.createdAt.getTime(),
			});
		}
	}

	private _cleanupExpiredEntries(): void {
		const now = Date.now();
		for (const [nonce, entry] of this._l1) {
			if (now - entry.createdAt > this._ttlMs) {
				this._l1.delete(nonce);
			}
		}
	}

	private _startCleanup(): void {
		const interval = Math.min(this._ttlMs / 2, 60_000);
		this._cleanupTimer.startInterval(
			() => this._cleanupExpiredEntries(),
			interval
		);
		this._cleanupTimer.unref();
	}
}
