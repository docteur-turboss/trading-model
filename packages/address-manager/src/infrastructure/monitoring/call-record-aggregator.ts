import type {
	Bytes,
	DurationMs,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import {
	aggregateRecord,
	aggregateTotals,
	type CallRecord,
} from "./service-call-tracker";

export type EndpointKey = string & { readonly brand: "EndpointKey" };

export interface AggregationTotals {
	callsByService: Record<ServiceId, number>;
	callsByEndpoint: Record<EndpointKey, number>;
	errorsTotal: number;
	totalLatency: DurationMs;
	bytesSent: Bytes;
	bytesReceived: Bytes;
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
	): Pick<
		AggregationTotals,
		"errorsTotal" | "totalLatency" | "bytesSent" | "bytesReceived"
	> {
		let totals = {
			errorsTotal: 0,
			totalLatency: 0 as DurationMs,
			bytesSent: 0 as Bytes,
			bytesReceived: 0 as Bytes,
		};
		for (const record of records) {
			aggregateRecord(record, callsByService, callsByEndpoint);
			totals = aggregateTotals(record, totals);
		}
		return totals;
	}
}
