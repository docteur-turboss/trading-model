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
import type { AuditFilter } from "@trading-model/validation/adapters/inbound/admin/audit.dto";
import type { Collection, Db } from "mongodb";
import { EVENTS_STORED_TOTAL } from "../../../config/metrics";
import type { DateRange } from "../../../domain/date-range";
import { computeAuditHash } from "./audit-document-builder";
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

export interface AuditEventQuery extends QueryEnvelope, AuditFilter {}

export interface AuditStats {
	totalEvents: number;
	eventsByTopic: Record<Topic, number>;
	eventsByPublisher: Record<ServiceId, number>;
	dateRange: DateRange<Date>;
}

const COLLECTION = "audit_events";

export class AuditRepository
	implements MongoRepository<AuditEventDocument, AuditEventQuery>
{
	private readonly _collection: Collection<AuditEventDocument>;
	private readonly _querier: AuditQuerier;

	constructor(db: Db) {
		this._collection = db.collection<AuditEventDocument>(COLLECTION);
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

	async insert(event: AuditEventDocument): Promise<void> {
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
			await this._collection.insertOne(event);
			EVENTS_STORED_TOTAL.inc({ status: "success" });
		} catch (err) {
			throw agentError("Failed to persist audit event", {
				cause: err,
			});
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
			await this._collection.insertMany(events, { ordered: false });
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
