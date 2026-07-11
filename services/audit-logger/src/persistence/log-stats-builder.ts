import type { LogLevel } from "@trading-model/common/config/log-types";
import {
	ISODateTime,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import type { LogStats } from "./log-repository";

type MongoDoc = Record<string, unknown>;

export class LogStatsBuilder {
	build(): MongoDoc[] {
		return [{ $facet: this._buildFacets() }];
	}

	private _buildFacets(): MongoDoc {
		return {
			byService: this._buildByServiceFacet(),
			byLevel: this._buildByLevelFacet(),
			dateRange: this._buildDateRangeFacet(),
			total: this._buildTotalFacet(),
		};
	}

	private _buildByServiceFacet(): MongoDoc[] {
		return [{ $group: { _id: "$service.name", count: { $sum: 1 } } }];
	}

	private _buildByLevelFacet(): MongoDoc[] {
		return [{ $group: { _id: "$level", count: { $sum: 1 } } }];
	}

	private _buildDateRangeFacet(): MongoDoc[] {
		return [
			{
				$group: {
					_id: null,
					earliest: { $min: "$receivedAt" },
					latest: { $max: "$receivedAt" },
				},
			},
		];
	}

	private _buildTotalFacet(): MongoDoc[] {
		return [{ $count: "count" }];
	}

	parseResult(aggResult: Record<string, unknown>): LogStats {
		return {
			total: this._extractTotal(aggResult),
			byService: this._extractServiceMap(aggResult, "byService"),
			byLevel: this._extractMap(aggResult, "byLevel"),
			dateRange: this._extractDateRange(aggResult),
		};
	}

	private _extractTotal(aggResult: Record<string, unknown>): number {
		return (aggResult?.total as Array<{ count: number }>)?.[0]?.count ?? 0;
	}

	private _extractServiceMap(
		aggResult: Record<string, unknown>,
		key: string
	): Record<ServiceId, number> {
		const result: Record<ServiceId, number> = {};
		for (const item of (aggResult?.[key] as Record<string, unknown>[]) ?? []) {
			result[ServiceId.of(String(item._id))] = Number(item.count);
		}
		return result;
	}

	private _extractMap(
		aggResult: Record<string, unknown>,
		key: string
	): Record<LogLevel, number> {
		const result: Record<string, number> = {};
		for (const item of (aggResult?.[key] as Record<string, unknown>[]) ?? []) {
			result[String(item._id)] = Number(item.count);
		}
		return result;
	}

	private _extractDateRange(aggResult: Record<string, unknown>): {
		earliest?: ISODateTime;
		latest?: ISODateTime;
	} {
		const dr = (
			aggResult?.dateRange as Array<{ earliest?: Date; latest?: Date }>
		)?.[0];
		return {
			earliest: dr?.earliest
				? ISODateTime.of(dr.earliest.toISOString())
				: undefined,
			latest: dr?.latest ? ISODateTime.of(dr.latest.toISOString()) : undefined,
		};
	}
}
