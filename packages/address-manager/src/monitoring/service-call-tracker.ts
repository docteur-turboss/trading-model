import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

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
		const agg = this._aggregateRecords();
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

	private _aggregateRecords(): {
		callsByService: Record<ServiceId, number>;
		callsByEndpoint: Record<string, number>;
		errorsTotal: number;
		totalLatency: number;
		bytesSent: number;
		bytesReceived: number;
	} {
		const callsByService: Record<ServiceId, number> = {};
		const callsByEndpoint: Record<string, number> = {};
		let errorsTotal = 0;
		let totalLatency = 0;
		let bytesSent = 0;
		let bytesReceived = 0;
		for (const record of this._records) {
			this._aggregateRecord(record, callsByService, callsByEndpoint);
			errorsTotal += record.status === "error" ? 1 : 0;
			totalLatency += record.durationMs;
			bytesSent += record.bytesSent ?? 0;
			bytesReceived += record.bytesReceived ?? 0;
		}
		return {
			callsByService,
			callsByEndpoint,
			errorsTotal,
			totalLatency,
			bytesSent,
			bytesReceived,
		};
	}

	private _aggregateRecord(
		record: CallRecord,
		callsByService: Record<ServiceId, number>,
		callsByEndpoint: Record<string, number>
	): void {
		callsByService[record.targetService] =
			(callsByService[record.targetService] ?? 0) + 1;
		const ep = `${record.method} ${record.endpoint}`;
		callsByEndpoint[ep] = (callsByEndpoint[ep] ?? 0) + 1;
	}

	clear(): void {
		this._records = [];
	}

	getRecords(): readonly CallRecord[] {
		return this._records;
	}
}
