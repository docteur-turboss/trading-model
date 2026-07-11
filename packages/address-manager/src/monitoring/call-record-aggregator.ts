import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { CallRecord } from "./service-call-tracker";

export type EndpointKey = string & { readonly brand: "EndpointKey" };
export const EndpointKey = {
	of(method: string, endpoint: string): EndpointKey {
		return `${method} ${endpoint}` as EndpointKey;
	},
};

export interface AggregationTotals {
	callsByService: Record<ServiceId, number>;
	callsByEndpoint: Record<EndpointKey, number>;
	errorsTotal: number;
	totalLatency: number;
	bytesSent: number;
	bytesReceived: number;
}

export class CallRecordAggregator {
	aggregate(records: CallRecord[]): AggregationTotals {
		const callsByService: Record<ServiceId, number> = {};
		const callsByEndpoint: Record<EndpointKey, number> = {};
		const totals = this._reduceRecords(
			records,
			callsByService,
			callsByEndpoint
		);
		return { callsByService, callsByEndpoint, ...totals };
	}

	private _reduceRecords(
		records: CallRecord[],
		callsByService: Record<ServiceId, number>,
		callsByEndpoint: Record<EndpointKey, number>
	): {
		errorsTotal: number;
		totalLatency: number;
		bytesSent: number;
		bytesReceived: number;
	} {
		let totals = {
			errorsTotal: 0,
			totalLatency: 0,
			bytesSent: 0,
			bytesReceived: 0,
		};
		for (const record of records) {
			this._aggregateRecord(record, callsByService, callsByEndpoint);
			totals = this._aggregateTotals(record, totals);
		}
		return totals;
	}

	private _aggregateRecord(
		record: CallRecord,
		callsByService: Record<ServiceId, number>,
		callsByEndpoint: Record<EndpointKey, number>
	): void {
		callsByService[record.targetService] =
			(callsByService[record.targetService] ?? 0) + 1;
		const ep = EndpointKey.of(record.method, record.endpoint);
		callsByEndpoint[ep] = (callsByEndpoint[ep] ?? 0) + 1;
	}

	private _aggregateTotals(
		record: CallRecord,
		totals: {
			errorsTotal: number;
			totalLatency: number;
			bytesSent: number;
			bytesReceived: number;
		}
	): {
		errorsTotal: number;
		totalLatency: number;
		bytesSent: number;
		bytesReceived: number;
	} {
		return {
			errorsTotal: totals.errorsTotal + (record.status === "error" ? 1 : 0),
			totalLatency: totals.totalLatency + record.durationMs,
			bytesSent: totals.bytesSent + (record.bytesSent ?? 0),
			bytesReceived: totals.bytesReceived + (record.bytesReceived ?? 0),
		};
	}
}
