import { logger } from "@trading-model/common/config/logger";
import {
	DurationMs,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import { NonceCache } from "./nonce-cache";
import { NonceGenerator } from "./nonce-generator";
import type { NonceContext, NoncePersistence } from "./nonce-persister";

export interface NonceStoreOptions {
	ttlMs?: DurationMs;
	persister?: NoncePersistence;
}

export class NonceStore {
	private readonly _ttlMs: DurationMs;
	private readonly _persister?: NoncePersistence;
	private readonly _cache: NonceCache;
	private readonly _generator: NonceGenerator;

	constructor(options?: NonceStoreOptions) {
		this._ttlMs = options?.ttlMs ?? DurationMs.of(300_000);
		this._persister = options?.persister;
		this._cache = new NonceCache(this._ttlMs);
		this._generator = new NonceGenerator();
	}

	async connect(): Promise<void> {
		try {
			await this._persister?.connect();
			const threshold = new Date(Date.now() - this._ttlMs);
			const docs = await (this._persister?.loadAll(threshold) ?? []);
			this._cache.loadFromPersister(docs);
			logger.info("NonceStore connected to MongoDB", {
				context: { existingNonces: this._cache.size },
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
		const nonce = this._generator.generate();
		const createdAt = Date.now();
		try {
			await this._persister?.persist({ nonce, serviceId }, createdAt);
		} catch {
			logger.debug("Nonce persist failed, using memory-only fallback");
		}
		this._cache.set(nonce, serviceId);
		return nonce;
	}

	async consume(context: NonceContext): Promise<boolean> {
		const entry = this._cache.get(context.nonce);
		if (entry && this._cache.isExpired(entry.createdAt)) {
			this._cache.delete(context.nonce);
			return false;
		}
		const doc = await this._persister?.consume(context);
		if (doc) {
			if (
				doc.serviceId !== context.serviceId ||
				this._cache.isExpired(doc.createdAt.getTime())
			) {
				return false;
			}
			this._cache.delete(context.nonce);
			return true;
		}
		if (!entry || entry.serviceId !== context.serviceId) {
			return false;
		}
		this._cache.delete(context.nonce);
		return true;
	}

	get size(): number {
		return this._cache.size;
	}

	destroy(): void {
		this._cache.destroy();
	}
}
