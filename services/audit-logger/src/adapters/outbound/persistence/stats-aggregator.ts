import { getLogger } from "@trading-model/contracts/logger-registry";
import type { ServiceId, Topic } from "@trading-model/primitives/primitives";
import type { Collection } from "mongodb";
import type { DateRange } from "../../../domain/date-range";
import type { AuditEventDocument, AuditStats } from "./audit-repository";

function aggregateByField(
	col: Collection<AuditEventDocument>,
	field: string
): Promise<Array<{ _id: string; count: number }>> {
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

/** Oldest and newest `receivedAt`: two reads of the `receivedAt` index, whatever the size. */
async function readDateRange(
	col: Collection<AuditEventDocument>
): Promise<DateRange<Date>> {
	const [oldest, newest] = await Promise.all([
		col
			.find({}, { projection: { receivedAt: 1 } })
			.sort({ receivedAt: 1 })
			.limit(1)
			.toArray(),
		col
			.find({}, { projection: { receivedAt: 1 } })
			.sort({ receivedAt: -1 })
			.limit(1)
			.toArray(),
	]);
	return {
		earliest: oldest[0]?.receivedAt ?? null,
		latest: newest[0]?.receivedAt ?? null,
	};
}

function toMap(
	items: Array<{ _id: string; count: number }>
): Record<string, number> {
	return Object.fromEntries(items.map((item) => [item._id, item.count]));
}

/**
 * The per-topic and per-publisher counts need a pass over the collection, so
 * they are computed at most once per `REFRESH_MS` and served from memory
 * (stale while refreshing, in the background). The total and the date range
 * stay live and cost the same whatever the collection size.
 */
const REFRESH_MS = 60_000;

interface CountsSnapshot {
	byTopic: Record<string, number>;
	byPublisher: Record<string, number>;
	computedAt: number;
}

export class StatsAggregator {
	private _snapshot: CountsSnapshot | null = null;
	private _refresh: Promise<CountsSnapshot> | null = null;

	constructor(private readonly _collection: Collection<AuditEventDocument>) {}

	async getStats(): Promise<AuditStats> {
		const [totalEvents, dateRange, counts] = await Promise.all([
			this._collection.estimatedDocumentCount(),
			readDateRange(this._collection),
			this._counts(),
		]);
		return {
			totalEvents,
			eventsByTopic: counts.byTopic as Record<Topic, number>,
			eventsByPublisher: counts.byPublisher as Record<ServiceId, number>,
			dateRange,
		};
	}

	/** Starts the first pass at boot; a failure is logged, the first request retries. */
	warm(): void {
		this._startRefresh().catch((err) =>
			getLogger().warn("Audit stats warm-up failed", { error: String(err) })
		);
	}

	private _counts(): Promise<CountsSnapshot> {
		const snapshot = this._snapshot;
		if (!snapshot) {
			return this._startRefresh();
		}
		if (Date.now() - snapshot.computedAt >= REFRESH_MS && !this._refresh) {
			// A failed background refresh keeps the stale snapshot; the next call retries.
			this._startRefresh().catch((err) =>
				getLogger().warn("Audit stats refresh failed", { error: String(err) })
			);
		}
		return Promise.resolve(snapshot);
	}

	private _startRefresh(): Promise<CountsSnapshot> {
		this._refresh ??= Promise.all([
			aggregateByField(this._collection, "topic"),
			aggregateByField(this._collection, "publisher"),
		])
			.then(([topics, publishers]) => {
				this._snapshot = {
					byTopic: toMap(topics),
					byPublisher: toMap(publishers),
					computedAt: Date.now(),
				};
				return this._snapshot;
			})
			.finally(() => {
				this._refresh = null;
			});
		return this._refresh;
	}
}
