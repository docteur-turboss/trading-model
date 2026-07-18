import { randomBytes } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import {
	DurationMs,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";
import type { NonceContext, NoncePersistence } from "./nonce-persister";

interface NonceEntry extends NonceContext {
	createdAt: number;
}

export interface NonceStoreOptions {
	ttlMs?: DurationMs;
	persister?: NoncePersistence;
}

export class NonceStore {
	private readonly _l1 = new Map<string, NonceEntry>();
	private readonly _ttlMs: DurationMs;
	private readonly _persister?: NoncePersistence;
	private readonly _cleanupTimer = new TimerHandle();

	constructor(options?: NonceStoreOptions) {
		this._ttlMs = options?.ttlMs ?? DurationMs.of(300_000);
		this._persister = options?.persister;
		this._startCleanup();
	}

	async connect(): Promise<void> {
		try {
			await this._persister?.connect();
			await this._loadFromPersister();
			logger.info("NonceStore connected to MongoDB", {
				context: { existingNonces: this._l1.size },
			});
		} catch (err) {
			logger.warn(
				"NonceStore MongoDB connection failed, operating in memory-only mode",
				{ context: { err } }
			);
		}
	}
	disconnect(): void {
		this.destroy();
		this._persister?.disconnect().catch(() => {});
	}

	async generate(serviceId: ServiceId): Promise<string> {
		const nonce = randomBytes(32).toString(CryptoAlg.HEX);
		const entry: NonceEntry = { nonce, serviceId, createdAt: Date.now() };
		try {
			await this._persister?.persist(
				{ nonce, serviceId } as NonceContext,
				entry.createdAt
			);
		} catch {
			logger.debug("Nonce persist failed, using memory-only fallback");
		}
		this._l1.set(nonce, entry);
		return nonce;
	}
	private _isExpired(createdAt: number): boolean {
		return Date.now() - createdAt > this._ttlMs;
	}

	async consume(context: NonceContext): Promise<boolean> {
		const entry = this._l1.get(context.nonce);
		if (entry && this._isExpired(entry.createdAt)) {
			this._l1.delete(context.nonce);
			return false;
		}
		const doc = await this._persister?.consume(context);
		if (doc) {
			if (
				doc.serviceId !== context.serviceId ||
				this._isExpired(doc.createdAt.getTime())
			) {
				return false;
			}
			this._l1.delete(context.nonce);
			return true;
		}
		if (!entry || entry.serviceId !== context.serviceId) {
			return false;
		}
		this._l1.delete(context.nonce);
		return true;
	}
	get size(): number {
		return this._l1.size;
	}
	destroy(): void {
		this._cleanupTimer.stop();
		this._l1.clear();
	}

	private async _loadFromPersister(): Promise<void> {
		const threshold = new Date(Date.now() - this._ttlMs);
		for (const doc of await (this._persister?.loadAll(threshold) ?? [])) {
			this._l1.set(doc.nonce, {
				nonce: doc.nonce,
				serviceId: doc.serviceId,
				createdAt: doc.createdAt.getTime(),
			});
		}
	}
	private _cleanupExpiredL1Entries(): void {
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
			() => this._cleanupExpiredL1Entries(),
			interval
		);
		this._cleanupTimer.unref();
	}
}
