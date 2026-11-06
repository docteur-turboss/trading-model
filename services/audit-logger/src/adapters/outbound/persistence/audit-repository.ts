import { agentError } from "@trading-model/common/utils/errors";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
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
import { EVENTS_STORED_TOTAL } from "../../../config/metrics";
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

/** Attempts when another writer takes the next chain sequence first. */
const MAX_CHAIN_ATTEMPTS = 5;
const DUPLICATE_KEY = 11000;
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

export class AuditRepository {
	private readonly _collection: Collection<AuditEventDocument>;
	private readonly _querier: AuditQuerier;
	private readonly _chain: MongoAuditChainReader;
	/** Inserts of this instance run one at a time: each extends the chain tail. */
	private _writes: Promise<unknown> = Promise.resolve();

	constructor(db: Db) {
		this._collection = db.collection<AuditEventDocument>(EVENTS_COLLECTION);
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

	private async _appendToChain(event: AuditEventDocument): Promise<void> {
		for (let attempt = 1; ; attempt++) {
			try {
				const tail = await this._chain.head();
				event.previousHash = tail?.dataHash ?? "";
				event.chainSequence = (tail?.chainSequence ?? 0) + 1;
				event.dataHash = computeAuditHash(hashedContentOf(event));
				await this._collection.insertOne(event, STORE_AS_HASHED);
				EVENTS_STORED_TOTAL.inc({ status: "success" });
				return;
			} catch (err) {
				const key = duplicateKeyOf(err);
				if (key === METADATA_FIELDS.messageId) {
					EVENTS_STORED_TOTAL.inc({ status: "duplicate" });
					return;
				}
				if (key === "chainSequence" && attempt < MAX_CHAIN_ATTEMPTS) {
					continue;
				}
				throw agentError("Failed to persist audit event", {
					cause: err,
				});
			}
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
