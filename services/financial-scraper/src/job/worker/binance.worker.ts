import { HELPER } from "@trading-model/broker-message";
import { buildResponse, fetchAllRawData } from "./binance-worker-helpers";
import type {
	BinanceWorkerOptions,
	BinanceWorkerResult,
} from "./binance-worker-types";
import {
	buildMarketDataEntries,
	sendAllMarketData,
} from "./market-data-sender";
import { configureMetadata } from "./metadata-builder";

export type { BinanceWorkerOptions, BinanceWorkerResult };

export class BinanceWorker {
	constructor(private readonly _options: BinanceWorkerOptions) {}

	public async run(): Promise<BinanceWorkerResult> {
		const builderMetadata = new HELPER.metadataBuilder();
		const opts = this._options;

		const rawData = await fetchAllRawData(opts);
		const response = buildResponse(opts.symbol, opts.interval, rawData);

		configureMetadata(builderMetadata, opts.deliveryMode);
		sendAllMarketData(buildMarketDataEntries(response), builderMetadata);

		return response;
	}
}
