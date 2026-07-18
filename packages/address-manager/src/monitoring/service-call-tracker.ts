import type { HttpMethod } from "@trading-model/common/config/http-types";
import type {
	Bytes,
	DurationMs,
	PositiveInt,
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { AggregationTotals, EndpointKey } from "./call-record-aggregator";
import { CallRecordAggregator } from "./call-record-aggregator";

export enum CallStatus {
	Success = "success",
	Error = "error",
}

export type Endpoint = string & { readonly brand: "Endpoint" };
export const Endpoint = {
	of(value: string): Endpoint {
		return value as Endpoint;
	},
};

export interface CallRecord {
	targetService: ServiceId;
	endpoint: Endpoint;
	method: HttpMethod;
	timestamp: UnixTimestamp;
	durationMs: DurationMs;
	status: CallStatus;
	bytesSent?: Bytes;
	bytesReceived?: Bytes;
	errorMessage?: string;
}

export function aggregateRecord(
	record: CallRecord,
	callsByService: Record<ServiceId, number>,
	callsByEndpoint: Record<EndpointKey, number>
): void {
	callsByService[record.targetService] =
		(callsByService[record.targetService] ?? 0) + 1;
	const ep = `${record.method} ${record.endpoint}` as EndpointKey;
	callsByEndpoint[ep] = (callsByEndpoint[ep] ?? 0) + 1;
}

export function aggregateTotals(
	record: CallRecord,
	totals: Pick<
		AggregationTotals,
		"errorsTotal" | "totalLatency" | "bytesSent" | "bytesReceived"
	>
): Pick<
	AggregationTotals,
	"errorsTotal" | "totalLatency" | "bytesSent" | "bytesReceived"
> {
	return {
		errorsTotal:
			totals.errorsTotal + (record.status === CallStatus.Error ? 1 : 0),
		totalLatency: (totals.totalLatency + record.durationMs) as DurationMs,
		bytesSent: (totals.bytesSent + (record.bytesSent ?? 0)) as Bytes,
		bytesReceived: (totals.bytesReceived +
			(record.bytesReceived ?? 0)) as Bytes,
	};
}

export interface CallTrackerSnapshot {
	totalCalls: PositiveInt;
	callsByService: Record<ServiceId, number>;
	callsByEndpoint: Record<EndpointKey, number>;
	errorsTotal: PositiveInt;
	avgLatencyMs: DurationMs;
	totalBytesSent: Bytes;
	totalBytesReceived: Bytes;
}

const EMPTY_SNAPSHOT: CallTrackerSnapshot = {
	totalCalls: 0 as PositiveInt,
	callsByService: {},
	callsByEndpoint: {},
	errorsTotal: 0 as PositiveInt,
	avgLatencyMs: 0 as DurationMs,
	totalBytesSent: 0 as Bytes,
	totalBytesReceived: 0 as Bytes,
};

export class ServiceCallTracker {
	private _records: CallRecord[] = [];
	private readonly _maxRecords: number;
	private readonly _aggregator = new CallRecordAggregator();

	constructor(maxRecords = 1000) {
		this._maxRecords = maxRecords;
	}

	record(call: CallRecord): void {
		this._records.push(call);
		if (this._records.length > this._maxRecords) {
			this._records.shift();
		}
	}

	snapshot(): CallTrackerSnapshot {
		const total = this._records.length;
		if (total === 0) {
			return EMPTY_SNAPSHOT;
		}
		return this._buildSnapshot(total);
	}

	private _buildSnapshot(total: number): CallTrackerSnapshot {
		const agg = this._aggregator.aggregate(this._records);
		return {
			totalCalls: total as PositiveInt,
			callsByService: agg.callsByService,
			callsByEndpoint: agg.callsByEndpoint,
			errorsTotal: agg.errorsTotal as PositiveInt,
			avgLatencyMs: Math.round(agg.totalLatency / total) as DurationMs,
			totalBytesSent: agg.bytesSent as Bytes,
			totalBytesReceived: agg.bytesReceived as Bytes,
		};
	}

	clear(): void {
		this._records = [];
	}

	getRecords(): readonly CallRecord[] {
		return this._records;
	}
}
