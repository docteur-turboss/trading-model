/**
 * NonceStore — stores proof-of-possession (POP) nonces for certificate renewal.
 *
 * Flow:
 * 1. Client requests a renewal challenge → CA generates nonce, stores it
 * 2. Client signs the nonce with its private key → sends signature + old serial
 * 3. CA verifies signature against the old cert's public key → if valid, renews
 *
 * Nonces expire after ttlMs to prevent replay attacks.
 *
 * Persistence: Nonces are stored in both an in-memory Map (L1 cache) and
 * optionally MongoDB (L2 persistence) via a NoncePersistence backend.
 * On startup, all non-expired nonces are loaded from the backend into memory.
 * This ensures nonces survive CA restarts.
 */
import { randomBytes } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

import type { NonceContext, NoncePersistence } from "./nonce-persister";
import { MongoNoncePersister, NullNoncePersister } from "./nonce-persister";

interface NonceEntry {
	nonce: string;
	serviceId: string;
	createdAt: number;
}

export class NonceStore {
	private readonly _l1 = new Map<string, NonceEntry>();
	private readonly _ttlMs: number;
	private readonly _persister: NoncePersistence;
	private readonly _cleanupTimer = new TimerHandle();

	constructor(ttlMs = 300_000, mongoUri?: string) {
		this._ttlMs = ttlMs;
		this._persister = mongoUri
			? new MongoNoncePersister(mongoUri, ttlMs)
			: new NullNoncePersister();
		this._startCleanup();
	}

	async connect(): Promise<void> {
		try {
			await this._persister.connect();
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
		this._persister.disconnect().catch(() => {});
	}

	async generate(serviceId: string): Promise<string> {
		const nonce = randomBytes(32).toString("hex");
		const entry: NonceEntry = { nonce, serviceId, createdAt: Date.now() };
		const context: NonceContext = { nonce, serviceId };
		try {
			await this._persister.persist(context, entry.createdAt);
		} catch {
			logger.debug("Nonce persist failed, using memory-only fallback");
		}
		this._l1.set(nonce, entry);
		return nonce;
	}

	private _isExpired(createdAt: number): boolean {
		return Date.now() - createdAt > this._ttlMs;
	}

	async consume(nonce: string, serviceId: string): Promise<boolean> {
		const entry = this._l1.get(nonce);
		if (entry && this._isExpired(entry.createdAt)) {
			this._l1.delete(nonce);
			return false;
		}
		const context: NonceContext = { nonce, serviceId };
		const doc = await this._persister.consume(context);
		if (doc) {
			if (
				doc.serviceId !== serviceId ||
				this._isExpired(doc.createdAt.getTime())
			) {
				return false;
			}
			this._l1.delete(nonce);
			return true;
		}
		if (!entry || entry.serviceId !== serviceId) {
			return false;
		}
		this._l1.delete(nonce);
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
		const docs = await this._persister.loadAll(threshold);
		for (const doc of docs) {
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
