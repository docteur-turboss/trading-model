import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { LogStats } from "./log-repository";

type MongoDoc = Record<string, unknown>;

export class LogStatsBuilder {
	buildPipeline(): MongoDoc[] {
		return [
			{
				$facet: {
					byService: [{ $group: { _id: "$service.name", count: { $sum: 1 } } }],
					byLevel: [{ $group: { _id: "$level", count: { $sum: 1 } } }],
					dateRange: [
						{
							$group: {
								_id: null,
								earliest: { $min: "$receivedAt" },
								latest: { $max: "$receivedAt" },
							},
						},
					],
					total: [{ $count: "count" }],
				},
			},
		];
	}

	parseResult(aggResult: Record<string, unknown>): LogStats {
		return {
			total: this._extractTotal(aggResult),
			byService: this._extractMap(aggResult, "byService") as Record<
				ServiceId,
				number
			>,
			byLevel: this._extractMap(aggResult, "byLevel"),
			dateRange: this._extractDateRange(aggResult),
		};
	}

	private _extractTotal(aggResult: Record<string, unknown>): number {
		return (aggResult?.total as Array<{ count: number }>)?.[0]?.count ?? 0;
	}

	private _extractMap(
		aggResult: Record<string, unknown>,
		key: string
	): Record<string, number> {
		const result: Record<string, number> = {};
		for (const item of (aggResult?.[key] as Array<{
			_id: string;
			count: number;
		}>) ?? []) {
			result[item._id] = item.count;
		}
		return result;
	}

	private _extractDateRange(aggResult: Record<string, unknown>): {
		earliest?: string;
		latest?: string;
	} {
		const dr = (
			aggResult?.dateRange as Array<{ earliest?: Date; latest?: Date }>
		)?.[0];
		return {
			earliest: dr?.earliest?.toISOString(),
			latest: dr?.latest?.toISOString(),
		};
	}
}
