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
 * MongoDB (L2 persistence). On startup, all non-expired nonces are loaded
 * from MongoDB into memory. This ensures nonces survive CA restarts.
 */
import { randomBytes } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import { type Collection, type Db, MongoClient } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";

interface NonceEntry {
	nonce: string;
	serviceId: string;
	createdAt: number;
}

interface NonceDocument {
	nonce: string;
	serviceId: string;
	createdAt: Date;
}

export class NonceStore {
	private readonly _l1 = new Map<string, NonceEntry>();
	private readonly _ttlMs: number;
	private readonly _mongoUri: string | null;
	private _collection: Collection<NonceDocument> | null = null;
	private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor(ttlMs = 300_000, mongoUri?: string) {
		this._ttlMs = ttlMs;
		this._mongoUri = mongoUri ?? null;
		this._startCleanup();
	}

	async connect(): Promise<void> {
		if (!this._mongoUri) {
			return;
		}
		try {
			let db: Db;
			if (MONGO_MANAGER.isInitialized()) {
				db = MONGO_MANAGER.getDb();
			} else {
				const client = new MongoClient(this._mongoUri);
				await client.connect();
				db = client.db();
			}
			this._collection = db.collection<NonceDocument>("nonces");
			await this._collection.createIndex({ nonce: 1 }, { unique: true });
			await this._collection.createIndex(
				{ createdAt: 1 },
				{ expireAfterSeconds: Math.ceil(this._ttlMs / 1000) }
			);
			await this._loadFromMongo();
			logger.info("NonceStore connected to MongoDB", { context: {
				existingNonces: this._l1.size,
			} });
		} catch (err) {
			logger.warn(
				"NonceStore MongoDB connection failed, operating in memory-only mode",
				{ err }
			);
			this._collection = null;
		}
	}

	disconnect(): void {
		this.destroy();
		this._collection = null;
	}

	/**
	 * Generates a cryptographically random nonce for a given service.
	 * @returns The nonce string that the client must sign.
	 */
	async generate(serviceId: string): Promise<string> {
		const nonce = randomBytes(32).toString("hex");
		const entry: NonceEntry = { nonce, serviceId, createdAt: Date.now() };
		if (this._collection) {
			try {
				await this._collection.insertOne({
					nonce,
					serviceId,
					createdAt: new Date(entry.createdAt),
				});
			} catch (err) {
				logger.warn("Failed to persist nonce to MongoDB", { context: { err } });
				const error = new Error("Failed to persist nonce");
				(error as { cause?: unknown }).cause = err;
				throw error;
			}
		}
		this._l1.set(nonce, entry);
		return nonce;
	}

	/**
	 * Verifies a nonce is valid and was issued for the given service.
	 * Consumes the nonce (single-use) to prevent replay attacks.
	 */
	async consume(nonce: string, serviceId: string): Promise<boolean> {
		// Fast path: reject expired nonces from L1 cache without MongoDB round-trip
		const entry = this._l1.get(nonce);
		if (entry && Date.now() - entry.createdAt > this._ttlMs) {
			this._l1.delete(nonce);
			return false;
		}

		// Authoritative check: atomic MongoDB findOneAndDelete (cross-instance safe)
		if (this._collection) {
			try {
				const doc = await this._collection.findOneAndDelete({ nonce });
				if (!doc) {
					return false;
				}
				if (doc.serviceId !== serviceId) {
					return false;
				}
				if (Date.now() - doc.createdAt.getTime() > this._ttlMs) {
					return false;
				}
				this._l1.delete(nonce);
				return true;
			} catch {
				return false;
			}
		}

		// Memory-only mode (dev/test): use L1 cache as source of truth
		if (entry) {
			if (entry.serviceId !== serviceId) {
				return false;
			}
			this._l1.delete(nonce);
			return true;
		}
		return false;
	}

	get size(): number {
		return this._l1.size;
	}

	destroy(): void {
		if (this._cleanupTimer) {
			clearInterval(this._cleanupTimer);
			this._cleanupTimer = null;
		}
		this._l1.clear();
		this._collection = null;
	}

	private async _loadFromMongo(): Promise<void> {
		if (!this._collection) {
			return;
		}
		try {
			const threshold = new Date(Date.now() - this._ttlMs);
			const docs = await this._collection
				.find({ createdAt: { $gt: threshold } })
				.toArray();
			for (const doc of docs) {
				this._l1.set(doc.nonce, {
					nonce: doc.nonce,
					serviceId: doc.serviceId,
					createdAt: doc.createdAt.getTime(),
				});
			}
		} catch (err) {
			logger.warn("Failed to load nonces from MongoDB", { context: { err } });
		}
	}

	private _startCleanup(): void {
		this._cleanupTimer = setInterval(
			() => {
				const now = Date.now();
				for (const [nonce, entry] of this._l1) {
					if (now - entry.createdAt > this._ttlMs) {
						this._l1.delete(nonce);
					}
				}
			},
			Math.min(this._ttlMs / 2, 60_000)
		);
		if (
			this._cleanupTimer &&
			typeof this._cleanupTimer === "object" &&
			"unref" in this._cleanupTimer
		) {
			this._cleanupTimer.unref();
		}
	}
}
