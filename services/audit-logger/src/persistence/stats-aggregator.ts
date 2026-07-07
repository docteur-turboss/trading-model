import type { Collection } from "mongodb";
import type {
	AuditEventDocument,
	AuditStats,
} from "./audit-repository";
import type { ServiceId, Topic } from "@trading-model/common/domain/primitives";

function aggregateByField(
	col: Collection<AuditEventDocument>,
	field: string
): Promise<Array<{ _id: string } & { count: number }>> {
	return col
		.aggregate<{ _id: string; count: number }>([
			{
				$group: {
					_id: `$metadata.${field}`,
					count: { $sum: 1 },
				},
			},
		])
		.toArray();
}

function aggregateDateRange(
	col: Collection<AuditEventDocument>
): Promise<Array<{ earliest: Date | null; latest: Date | null }>> {
	return col
		.aggregate<{ earliest: Date | null; latest: Date | null }>([
			{
				$group: {
					_id: null,
					earliest: { $min: "$receivedAt" },
					latest: { $max: "$receivedAt" },
				},
			},
		])
		.toArray();
}

function toMap(
	items: Array<{ _id: string } & { count: number }>
): Record<string, number> {
	return Object.fromEntries(items.map((item) => [item._id, item.count]));
}

function buildStatsResult(
	totalEvents: number,
	topicAgg: Array<{ _id: string; count: number }>,
	publisherAgg: Array<{ _id: string; count: number }>,
	dateRange: Array<{ earliest: Date | null; latest: Date | null }>
): AuditStats {
	return {
		totalEvents,
		eventsByTopic: toMap(topicAgg) as Record<Topic, number>,
		eventsByPublisher: toMap(publisherAgg) as Record<ServiceId, number>,
		dateRange: {
			earliest: dateRange[0]?.earliest ?? null,
			latest: dateRange[0]?.latest ?? null,
		},
	};
}

export class StatsAggregator {
	constructor(private readonly _collection: Collection<AuditEventDocument>) {}

	async getStats(): Promise<AuditStats> {
		const [totalEvents, topicAgg, publisherAgg, dateRange] =
			await this._fetchStatsData();
		return buildStatsResult(totalEvents, topicAgg, publisherAgg, dateRange);
	}

	private async _fetchStatsData(): Promise<
		[
			number,
			Array<{ _id: string; count: number }>,
			Array<{ _id: string; count: number }>,
			Array<{ earliest: Date | null; latest: Date | null }>,
		]
	> {
		return Promise.all([
			this._collection.estimatedDocumentCount(),
			aggregateByField(this._collection, "topic"),
			aggregateByField(this._collection, "publisher"),
			aggregateDateRange(this._collection),
		]);
	}
}
