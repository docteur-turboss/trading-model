export interface CallRecord {
	targetService: string;
	endpoint: string;
	method: string;
	timestamp: number;
	durationMs: number;
	status: "success" | "error";
	bytesSent?: number;
	bytesReceived?: number;
	errorMessage?: string;
}

export interface CallTrackerSnapshot {
	totalCalls: number;
	callsByService: Record<string, number>;
	callsByEndpoint: Record<string, number>;
	errorsTotal: number;
	avgLatencyMs: number;
	totalBytesSent: number;
	totalBytesReceived: number;
}

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
			return {
				totalCalls: 0,
				callsByService: {},
				callsByEndpoint: {},
				errorsTotal: 0,
				avgLatencyMs: 0,
				totalBytesSent: 0,
				totalBytesReceived: 0,
			};
		}

		const callsByService: Record<string, number> = {};
		const callsByEndpoint: Record<string, number> = {};
		let errorsTotal = 0;
		let totalLatency = 0;
		let bytesSent = 0;
		let bytesReceived = 0;

		for (const record of this._records) {
			callsByService[record.targetService] =
				(callsByService[record.targetService] ?? 0) + 1;
			const ep = `${record.method} ${record.endpoint}`;
			callsByEndpoint[ep] = (callsByEndpoint[ep] ?? 0) + 1;
			if (record.status === "error") {
				errorsTotal++;
			}
			totalLatency += record.durationMs;
			bytesSent += record.bytesSent ?? 0;
			bytesReceived += record.bytesReceived ?? 0;
		}

		return {
			totalCalls: total,
			callsByService,
			callsByEndpoint,
			errorsTotal,
			avgLatencyMs: Math.round(totalLatency / total),
			totalBytesSent: bytesSent,
			totalBytesReceived: bytesReceived,
		};
	}

	clear(): void {
		this._records = [];
	}

	getRecords(): readonly CallRecord[] {
		return this._records;
	}
}
