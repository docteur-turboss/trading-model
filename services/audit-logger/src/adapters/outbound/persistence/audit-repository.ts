import { randomUUID } from "node:crypto";
import { ErrorCode, makeErrorCode } from "@trading-model/common/utils/errors";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type {
	PaginationResult,
	QueryEnvelope,
} from "@trading-model/primitives/pagination";
import type {
	CorrelationId,
	InstanceId,
	MessageId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import type { Collection, Db } from "mongodb";
import {
	CHAIN_COLLISIONS_TOTAL,
	EVENTS_STORED_TOTAL,
} from "../../../config/metrics";
import { computeAuditHash, hashedContentOf } from "../../../domain/audit-chain";
import type { DateRange } from "../../../domain/date-range";
import { EVENTS_COLLECTION, MongoAuditChainReader } from "./audit-chain-reader";
import { AuditQuerier } from "./audit-querier";

export interface AuditEventDocument {
	receivedAt: Date;
	ttl: Date;
	dataHash: string;
	previousHash: string;
	chainSequence: number;
	metadata: {
		topic: Topic;
		eventType: EventEnumMap;
		publisher: ServiceId;
		instanceId: InstanceId;
		messageId: MessageId;
		correlationId?: CorrelationId;
	};
	payload: unknown;
}

export const METADATA_FIELDS = {
	topic: "metadata.topic",
	publisher: "metadata.publisher",
	correlationId: "metadata.correlationId",
	messageId: "metadata.messageId",
} as const;

/** Filters of `GET /events`; an absent field does not filter. */
export interface AuditFilter {
	topic?: Topic;
	publisher?: ServiceId;
	correlationId?: CorrelationId;
}

export interface AuditEventQuery extends QueryEnvelope, AuditFilter {}

export interface AuditStats {
	totalEvents: number;
	eventsByTopic: Record<Topic, number>;
	eventsByPublisher: Record<ServiceId, number>;
	dateRange: DateRange<Date>;
}

const agentError = makeErrorCode(
	ErrorCode.Agent,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);

/** Attempts when another writer takes the next chain sequence first. */
const MAX_CHAIN_ATTEMPTS = 5;
const DUPLICATE_KEY = 11000;
const LEASE_COLLECTION = "audit_chain_lease";
const LEASE_ID = "head";
/** A holder that dies mid-append blocks the others at most this long. */
const LEASE_TTL_MS = 10_000;
const LEASE_WAIT_MS = 30_000;
const LEASE_POLL_MS = 20;
/** A holder hands the lease over after this long even with a non-empty queue. */
const LEASE_MAX_HOLD_MS = 2000;
/** Pause after a handover: longer than a waiter's poll (20-40 ms) so one wins. */
const LEASE_YIELD_MS = 100;

/** Events chained in one ordered insertMany. */
const MAX_BATCH = 100;

interface LeaseDocument {
	_id: string;
	owner: string;
	expiresAt: Date;
}

interface PendingWrite {
	event: AuditEventDocument;
	resolve: () => void;
	reject: (err: unknown) => void;
	/** Sequence collisions this write already went through. */
	collisions: number;
	enqueuedAt: number;
}

interface ChainTail {
	dataHash: string;
	chainSequence: number;
}

/**
 * Stores the event exactly as computeAuditHash saw it: JSON.stringify skips
 * undefined fields, the driver would store them as null and the dataHash of
 * the stored event could never be verified again (tests/backup/audit-chain.js).
 */
const STORE_AS_HASHED = { ignoreUndefined: true } as const;

/** The unique index a duplicate-key error hit, if it is one. */
function duplicateKeyOf(err: unknown): string | undefined {
	const error = err as {
		code?: number;
		keyPattern?: Record<string, unknown>;
		errmsg?: string;
	};
	if (error?.code !== DUPLICATE_KEY) {
		return;
	}
	if (error.keyPattern) {
		return Object.keys(error.keyPattern)[0] ?? "";
	}
	// Bulk write errors carry the index name in the message, not keyPattern.
	const msg = error.errmsg ?? "";
	if (msg.includes(METADATA_FIELDS.messageId)) {
		return METADATA_FIELDS.messageId;
	}
	return msg.includes("chainSequence") ? "chainSequence" : "";
}

/** The failing document of an ordered insertMany: its position and its error. */
function bulkFailureOf(
	err: unknown
): { index: number; error: unknown } | undefined {
	const writeErrors = (err as { writeErrors?: unknown })?.writeErrors;
	const first = Array.isArray(writeErrors) ? writeErrors[0] : writeErrors;
	const index = (first as { index?: unknown })?.index;
	return typeof index === "number" ? { index, error: first } : undefined;
}

export class AuditRepository {
	private readonly _collection: Collection<AuditEventDocument>;
	private readonly _lease: Collection<LeaseDocument>;
	private readonly _querier: AuditQuerier;
	private readonly _chain: MongoAuditChainReader;
	/** Events of this instance waiting for the next batch. */
	private _pending: PendingWrite[] = [];
	private _draining = false;
	/** Chain tail, trusted only while this instance holds the lease. */
	private _tail: ChainTail | null = null;

	constructor(db: Db) {
		this._collection = db.collection<AuditEventDocument>(EVENTS_COLLECTION);
		this._lease = db.collection<LeaseDocument>(LEASE_COLLECTION);
		this._querier = new AuditQuerier(this._collection);
		this._chain = new MongoAuditChainReader(db);
	}

	async ensureIndexes(): Promise<void> {
		await this._collection.createIndexes([
			{ key: { [METADATA_FIELDS.correlationId]: 1 } },
			{ key: { [METADATA_FIELDS.publisher]: 1, receivedAt: -1 } },
			{ key: { [METADATA_FIELDS.topic]: 1, receivedAt: -1 } },
			{ key: { receivedAt: -1 } },
			{ key: { [METADATA_FIELDS.messageId]: 1 }, unique: true },
			{ key: { ttl: 1 }, expireAfterSeconds: 0 },
			{ key: { chainSequence: 1 }, unique: true },
		]);
	}

	/**
	 * Appends the event to the hash chain. Messages arrive concurrently and are
	 * queued: one lease holder (ADR-0050, amended by ADR-0052) chains everything
	 * queued in one insertMany. Another replica can still take the same sequence
	 * first if the lease expired under a slow holder (unique index): the batch
	 * then retries on the new tail. A message already recorded (redelivery, same
	 * messageId) is not recorded twice.
	 */
	insert(event: AuditEventDocument): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._pending.push({
				event,
				resolve,
				reject,
				collisions: 0,
				enqueuedAt: Date.now(),
			});
			if (!this._draining) {
				this._draining = true;
				void this._drain();
			}
		});
	}

	/**
	 * Holds the lease while writes are queued, renews it before every batch and
	 * releases it once the queue is empty.
	 */
	private async _drain(): Promise<void> {
		const owner = randomUUID();
		let held = false;
		let heldSince = 0;
		try {
			while (this._pending.length > 0) {
				if (held && Date.now() - heldSince > LEASE_MAX_HOLD_MS) {
					// Fairness: let waiting replicas take a turn.
					await this._release(owner);
					held = false;
					await new Promise((resolve) => setTimeout(resolve, LEASE_YIELD_MS));
				}
				if (!(held && (await this._renew(owner)))) {
					this._tail = null;
					if (!(await this._acquire(owner))) {
						// Only what waited the whole LEASE_WAIT_MS fails; later arrivals keep waiting.
						this._rejectWaited();
						break;
					}
					held = true;
					heldSince = Date.now();
				}
				await this._writeBatch(this._pending.splice(0, MAX_BATCH));
			}
		} catch (err) {
			const failure = agentError("Failed to persist audit event", {
				cause: err,
			});
			for (const item of this._pending.splice(0)) {
				item.reject(failure);
			}
		} finally {
			this._tail = null;
			this._draining = false;
			if (held) {
				await this._release(owner);
			}
			if (this._pending.length > 0 && !this._draining) {
				this._draining = true;
				void this._drain();
			}
		}
	}

	/** An expired lease is simply taken over, so a failed release only delays others. */
	private async _release(owner: string): Promise<void> {
		try {
			await this._lease.updateOne(
				{ _id: LEASE_ID, owner },
				{ $set: { expiresAt: new Date(0) } }
			);
		} catch (err) {
			getLogger().warn("Audit chain lease not released", {
				error: String(err),
			});
		}
	}

	private _rejectWaited(): void {
		const err = agentError("Audit chain lease not acquired in time");
		const now = Date.now();
		this._pending = this._pending.filter((item) => {
			const waited = now - item.enqueuedAt >= LEASE_WAIT_MS;
			if (waited) {
				item.reject(err);
			}
			return !waited;
		});
	}

	/** Extends the lease if this owner still holds it (a takeover changes the owner). */
	private async _renew(owner: string): Promise<boolean> {
		const result = await this._lease.updateOne(
			{ _id: LEASE_ID, owner, expiresAt: { $gt: new Date() } },
			{ $set: { expiresAt: new Date(Date.now() + LEASE_TTL_MS) } }
		);
		return result.matchedCount > 0;
	}

	/** Waits for the lease; false once LEASE_WAIT_MS has passed. */
	private async _acquire(owner: string): Promise<boolean> {
		const deadline = Date.now() + LEASE_WAIT_MS;
		while (!(await this._tryAcquire(owner))) {
			if (Date.now() > deadline) {
				return false;
			}
			await new Promise((resolve) =>
				setTimeout(resolve, LEASE_POLL_MS * (1 + Math.random()))
			);
		}
		return true;
	}

	private async _tryAcquire(owner: string): Promise<boolean> {
		const now = new Date();
		try {
			// A held lease matches no filter, so the upsert hits the _id index.
			await this._lease.updateOne(
				{ _id: LEASE_ID, expiresAt: { $lte: now } },
				{ $set: { owner, expiresAt: new Date(now.getTime() + LEASE_TTL_MS) } },
				{ upsert: true }
			);
			return true;
		} catch (err) {
			if ((err as { code?: number })?.code === DUPLICATE_KEY) {
				return false;
			}
			throw agentError("Failed to acquire the audit chain lease", {
				cause: err,
			});
		}
	}

	/** Chains `writes` after the tail and stores them with ordered insertMany calls. */
	private async _writeBatch(writes: PendingWrite[]): Promise<void> {
		let remaining = writes;
		while (remaining.length > 0) {
			let tail: ChainTail;
			try {
				tail = this._tail ??
					(await this._chain.head()) ?? { dataHash: "", chainSequence: 0 };
			} catch (err) {
				this._reject(remaining, err);
				return;
			}
			const docs = remaining.map((item) => {
				item.event.previousHash = tail.dataHash;
				item.event.chainSequence = tail.chainSequence + 1;
				item.event.dataHash = computeAuditHash(hashedContentOf(item.event));
				tail = {
					dataHash: item.event.dataHash,
					chainSequence: item.event.chainSequence,
				};
				return item.event;
			});
			let stored = docs.length;
			let failure: unknown;
			try {
				await this._collection.insertMany(docs, {
					...STORE_AS_HASHED,
					ordered: true,
				});
			} catch (err) {
				const bulk = bulkFailureOf(err);
				if (!bulk) {
					this._reject(remaining, err);
					return;
				}
				stored = bulk.index;
				failure = bulk.error;
			}
			for (const item of remaining.slice(0, stored)) {
				EVENTS_STORED_TOTAL.inc({ status: "success" });
				item.resolve();
			}
			const last = docs[stored - 1];
			if (last) {
				this._tail = {
					dataHash: last.dataHash,
					chainSequence: last.chainSequence,
				};
			}
			if (failure === undefined) {
				return;
			}
			const key = duplicateKeyOf(failure);
			if (key === METADATA_FIELDS.messageId) {
				EVENTS_STORED_TOTAL.inc({ status: "duplicate" });
				remaining[stored].resolve();
				remaining = remaining.slice(stored + 1);
				continue;
			}
			if (key === "chainSequence") {
				// Another writer got in: the cached tail is stale and the lease may be
				// lost. Back to the drain loop, which renews or re-acquires it.
				this._tail = null;
				const [first, ...rest] = remaining.slice(stored);
				const retry = ++first.collisions < MAX_CHAIN_ATTEMPTS;
				CHAIN_COLLISIONS_TOTAL.inc({
					outcome: retry ? "retried" : "exhausted",
				});
				if (!retry) {
					this._reject([first], failure);
				}
				this._pending.unshift(...(retry ? [first, ...rest] : rest));
				return;
			}
			this._reject(remaining.slice(stored), failure);
			return;
		}
	}

	private _reject(writes: PendingWrite[], cause: unknown): void {
		this._tail = null;
		const err = agentError("Failed to persist audit event", { cause });
		for (const item of writes) {
			item.reject(err);
		}
	}

	findById(messageId: string): Promise<AuditEventDocument | null> {
		return this._querier.findById(messageId);
	}

	query(query: AuditEventQuery): Promise<PaginationResult<AuditEventDocument>> {
		return this._querier.query(query);
	}

	getStats(): Promise<AuditStats> {
		return this._querier.getStats();
	}
}
