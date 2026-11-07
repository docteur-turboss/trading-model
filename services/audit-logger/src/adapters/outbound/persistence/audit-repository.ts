import { randomUUID } from "node:crypto";
import { agentError } from "@trading-model/common/utils/errors";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import type { MongoRepository } from "@trading-model/persistence/mongo-repository.interface";
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
import { computeAuditHash } from "../../../domain/audit-chain";
import type { DateRange } from "../../../domain/date-range";
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

export const METADATA_FIELDS: {
	readonly topic: "metadata.topic";
	readonly publisher: "metadata.publisher";
	readonly correlationId: "metadata.correlationId";
	readonly messageId: "metadata.messageId";
} = {
	topic: "metadata.topic",
	publisher: "metadata.publisher",
	correlationId: "metadata.correlationId",
	messageId: "metadata.messageId",
};

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

const COLLECTION = "audit_events";

/** Attempts when another writer takes the next chain sequence first. */
const MAX_CHAIN_ATTEMPTS = 5;
const DUPLICATE_KEY = 11000;
const LEASE_COLLECTION = "audit_chain_lease";
const LEASE_ID = "head";
/** A holder that dies mid-append blocks the others at most this long. */
const LEASE_TTL_MS = 10_000;
const LEASE_WAIT_MS = 30_000;
const LEASE_POLL_MS = 20;

interface LeaseDocument {
	_id: string;
	owner: string;
	expiresAt: Date;
}
/**
 * Stores the event exactly as computeAuditHash saw it: JSON.stringify skips
 * undefined fields, the driver would store them as null and the dataHash of
 * the stored event could never be verified again (tests/backup/audit-chain.js).
 */
const STORE_AS_HASHED = { ignoreUndefined: true } as const;

/** The unique index a duplicate-key error hit, if it is one. */
function duplicateKeyOf(err: unknown): string | undefined {
	const error = err as { code?: number; keyPattern?: Record<string, unknown> };
	if (error?.code !== DUPLICATE_KEY) {
		return;
	}
	return Object.keys(error.keyPattern ?? {})[0] ?? "";
}

export class AuditRepository
	implements MongoRepository<AuditEventDocument, AuditEventQuery>
{
	private readonly _collection: Collection<AuditEventDocument>;
	private readonly _lease: Collection<LeaseDocument>;
	private readonly _querier: AuditQuerier;
	/** Inserts of this instance run one at a time: each extends the chain tail. */
	private _writes: Promise<unknown> = Promise.resolve();

	constructor(db: Db) {
		this._collection = db.collection<AuditEventDocument>(COLLECTION);
		this._lease = db.collection<LeaseDocument>(LEASE_COLLECTION);
		this._querier = new AuditQuerier(this._collection);
	}

	async ensureIndexes(): Promise<void> {
		await this._collection.createIndex({
			[METADATA_FIELDS.correlationId]: 1,
		});
		await this._collection.createIndex({
			[METADATA_FIELDS.publisher]: 1,
			receivedAt: -1,
		});
		await this._collection.createIndex({
			[METADATA_FIELDS.topic]: 1,
			receivedAt: -1,
		});
		await this._collection.createIndex({ receivedAt: -1 });
		await this._collection.createIndex(
			{ [METADATA_FIELDS.messageId]: 1 },
			{ unique: true }
		);
		await this._collection.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
		await this._collection.createIndex({ chainSequence: 1 }, { unique: true });
	}

	async findLastHash(): Promise<{
		previousHash: string;
		chainSequence: number;
	} | null> {
		const last = await this._collection
			.find()
			.sort({ chainSequence: -1 })
			.limit(1)
			.toArray();
		if (last.length === 0) {
			return null;
		}
		return {
			previousHash: last[0].dataHash,
			chainSequence: last[0].chainSequence,
		};
	}

	/**
	 * Appends the event to the hash chain. Messages arrive concurrently, so the
	 * inserts of this instance are queued; another replica can still take the
	 * same sequence first (unique index), and the insert then retries on the new
	 * tail. A message already recorded (redelivery, same messageId) is not
	 * recorded twice.
	 */
	insert(event: AuditEventDocument): Promise<void> {
		const write = this._writes.then(() => this._appendToChain(event));
		// biome-ignore lint/plugin: the caller gets the rejection through `write`; the queue must go on
		this._writes = write.catch(() => undefined);
		return write;
	}

	/**
	 * Single writer on the chain head (ADR-0046): one replica at a time holds
	 * the lease while it appends. Waits for it, bounded by LEASE_WAIT_MS.
	 */
	private async _withLease(work: () => Promise<void>): Promise<void> {
		const owner = randomUUID();
		const deadline = Date.now() + LEASE_WAIT_MS;
		while (!(await this._tryAcquire(owner))) {
			if (Date.now() > deadline) {
				throw agentError("Audit chain lease not acquired in time");
			}
			await new Promise((resolve) =>
				setTimeout(resolve, LEASE_POLL_MS * (1 + Math.random()))
			);
		}
		try {
			await work();
		} finally {
			// An expired lease is simply taken over, so a failed release only delays others.
			await this._lease.updateOne(
				{ _id: LEASE_ID, owner },
				{ $set: { expiresAt: new Date(0) } }
			);
		}
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

	private _appendToChain(event: AuditEventDocument): Promise<void> {
		return this._withLease(() => this._appendUnderLease(event));
	}

	private async _appendUnderLease(event: AuditEventDocument): Promise<void> {
		for (let attempt = 1; ; attempt++) {
			try {
				const tail = await this.findLastHash();
				event.previousHash = tail?.previousHash ?? "";
				event.chainSequence = (tail?.chainSequence ?? 0) + 1;
				event.dataHash = computeAuditHash({
					receivedAt: event.receivedAt,
					metadata: event.metadata,
					payload: event.payload,
					previousHash: event.previousHash,
					chainSequence: event.chainSequence,
				});
				await this._collection.insertOne(event, STORE_AS_HASHED);
				EVENTS_STORED_TOTAL.inc({ status: "success" });
				return;
			} catch (err) {
				const key = duplicateKeyOf(err);
				if (key === METADATA_FIELDS.messageId) {
					EVENTS_STORED_TOTAL.inc({ status: "duplicate" });
					return;
				}
				if (key === "chainSequence") {
					const retry = attempt < MAX_CHAIN_ATTEMPTS;
					CHAIN_COLLISIONS_TOTAL.inc({
						outcome: retry ? "retried" : "exhausted",
					});
					if (retry) {
						continue;
					}
				}
				throw agentError("Failed to persist audit event", {
					cause: err,
				});
			}
		}
	}

	async insertBatch(events: AuditEventDocument[]): Promise<void> {
		if (events.length === 0) {
			return;
		}
		try {
			let tail = await this.findLastHash();
			for (const event of events) {
				event.previousHash = tail?.previousHash ?? "";
				event.chainSequence = (tail?.chainSequence ?? 0) + 1;
				event.dataHash = computeAuditHash({
					receivedAt: event.receivedAt,
					metadata: event.metadata,
					payload: event.payload,
					previousHash: event.previousHash,
					chainSequence: event.chainSequence,
				});
				tail = {
					previousHash: event.dataHash,
					chainSequence: event.chainSequence,
				};
			}
			await this._collection.insertMany(events, {
				...STORE_AS_HASHED,
				ordered: false,
			});
			EVENTS_STORED_TOTAL.inc({ status: "success" }, events.length);
		} catch (err) {
			throw agentError("Failed to persist audit event batch", {
				cause: err,
			});
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
