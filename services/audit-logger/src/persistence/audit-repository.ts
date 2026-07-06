import type { AuditFilter } from "@trading-model/common/contracts/admin/audit.dto";
import type { DateRange } from "@trading-model/common/domain/date-range";
import type {
	PaginationQuery,
	PaginationResult,
} from "@trading-model/common/domain/pagination";
import type { ServiceId, Topic } from "@trading-model/common/domain/primitives";
import { agentError } from "@trading-model/common/utils/errors";
import type { Collection, Db } from "mongodb";
import { AuditQuerier } from "./audit-querier";

export interface AuditEventDocument {
	receivedAt: Date;
	metadata: {
		topic: Topic;
		eventType: string;
		publisher: ServiceId;
		instanceId: string;
		messageId: string;
		correlationId?: string;
	};
	payload: unknown;
}

export interface AuditEventQuery extends PaginationQuery, AuditFilter {
	dateRange?: DateRange;
}

export interface AuditStats {
	totalEvents: number;
	eventsByTopic: Record<Topic, number>;
	eventsByPublisher: Record<ServiceId, number>;
	dateRange: {
		earliest: Date | null;
		latest: Date | null;
	};
}

const COLLECTION = "audit_events";

export class AuditRepository {
	private readonly _collection: Collection<AuditEventDocument>;
	private readonly _querier: AuditQuerier;

	constructor(db: Db) {
		this._collection = db.collection<AuditEventDocument>(COLLECTION);
		this._querier = new AuditQuerier(this._collection);
	}

	async ensureIndexes(): Promise<void> {
		await this._collection.createIndex({ "metadata.correlationId": 1 });
		await this._collection.createIndex({
			"metadata.publisher": 1,
			receivedAt: -1,
		});
		await this._collection.createIndex({ "metadata.topic": 1, receivedAt: -1 });
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

	async findById(messageId: string): Promise<AuditEventDocument | null> {
		return this._querier.findById(messageId);
	}

	async query(
		query: AuditEventQuery
	): Promise<PaginationResult<AuditEventDocument>> {
		return this._querier.query(query);
	}

	async getStats(): Promise<AuditStats> {
		return this._querier.getStats();
	}
}
