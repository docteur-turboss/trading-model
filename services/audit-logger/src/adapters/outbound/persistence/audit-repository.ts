import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type {
	PaginationResult,
	QueryEnvelope,
} from "@trading-model/common/domain/pagination";
import type {
	CorrelationId,
	InstanceId,
	MessageId,
	ServiceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { MongoRepository } from "@trading-model/common/persistence/mongo-repository.interface";
import { agentError } from "@trading-model/common/utils/errors";
import type { AuditFilter } from "@trading-model/validation/adapters/inbound/admin/audit.dto";
import type { Collection, Db } from "mongodb";
import { AuditQuerier } from "../../../persistence/audit-querier";
import type { DateRange } from "../../../types/date-range";

export interface AuditEventDocument {
	receivedAt: Date;
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
} = {
	topic: "metadata.topic",
	publisher: "metadata.publisher",
	correlationId: "metadata.correlationId",
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
		await this._collection.createIndex({ [METADATA_FIELDS.correlationId]: 1 });
		await this._collection.createIndex({
			[METADATA_FIELDS.publisher]: 1,
			receivedAt: -1,
		});
		await this._collection.createIndex({
			[METADATA_FIELDS.topic]: 1,
			receivedAt: -1,
		});
		await this._collection.createIndex({ receivedAt: -1 });
	}

	async insert(event: AuditEventDocument): Promise<void> {
		try {
			await this._collection.insertOne(event);
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
			await this._collection.insertMany(events, { ordered: false });
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
