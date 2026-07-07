import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import {
	CallRecordAggregator,
} from "./call-record-aggregator";

export interface CallRecord {
	targetService: ServiceId;
	endpoint: string;
	method: string;
	timestamp: UnixTimestamp;
	durationMs: number;
	status: "success" | "error";
	bytesSent?: number;
	bytesReceived?: number;
	errorMessage?: string;
}

export interface CallTrackerSnapshot {
	totalCalls: number;
	callsByService: Record<ServiceId, number>;
	callsByEndpoint: Record<string, number>;
	errorsTotal: number;
	avgLatencyMs: number;
	totalBytesSent: number;
	totalBytesReceived: number;
}

const EMPTY_SNAPSHOT: CallTrackerSnapshot = {
	totalCalls: 0,
	callsByService: {},
	callsByEndpoint: {},
	errorsTotal: 0,
	avgLatencyMs: 0,
	totalBytesSent: 0,
	totalBytesReceived: 0,
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
		if (total === 0) return EMPTY_SNAPSHOT;
		return this._buildSnapshot(total);
	}

	private _buildSnapshot(total: number): CallTrackerSnapshot {
		const agg = this._aggregator.aggregate(this._records);
		return {
			totalCalls: total,
			callsByService: agg.callsByService,
			callsByEndpoint: agg.callsByEndpoint,
			errorsTotal: agg.errorsTotal,
			avgLatencyMs: Math.round(agg.totalLatency / total),
			totalBytesSent: agg.bytesSent,
			totalBytesReceived: agg.bytesReceived,
		};
	}

	clear(): void {
		this._records = [];
	}

	getRecords(): readonly CallRecord[] {
		return this._records;
	}
}
