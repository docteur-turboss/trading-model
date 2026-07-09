import type { ServiceId, Topic } from "@trading-model/common/domain/primitives";
import type { Collection } from "mongodb";
import type { AuditEventDocument, AuditStats } from "./audit-repository";

function aggregateByField(
	col: Collection<AuditEventDocument>,
	field: string
): Promise<Array<{ id: string; count: number }>> {
	return col
		.aggregate<{ id: string; count: number }>([
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
	items: Array<{ id: string; count: number }>
): Record<string, number> {
	return Object.fromEntries(
		items.map((item) => [
			(item as unknown as Record<string, string>)._id,
			item.count,
		])
	);
}

function buildStatsResult(
	totalEvents: number,
	topicAgg: Array<{ id: string; count: number }>,
	publisherAgg: Array<{ id: string; count: number }>,
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

	private _fetchStatsData(): Promise<
		[
			number,
			Array<{ id: string; count: number }>,
			Array<{ id: string; count: number }>,
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
