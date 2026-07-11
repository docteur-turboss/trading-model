import { HELPER } from "@trading-model/broker-message";
import { CandleInterval } from "@trading-model/common/config/event.types";
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
		const MetadataBuilder = HELPER.metadataBuilder as unknown as {
			new (): typeof HELPER.metadataBuilder.prototype;
		};
		const builderMetadata = new MetadataBuilder();
		const opts = this._options;

		const rawData = await fetchAllRawData(opts);
		const response = buildResponse(
			{ symbol: opts.symbol, interval: opts.interval ?? CandleInterval.Min1 },
			rawData
		);

		configureMetadata(builderMetadata, opts.deliveryMode);
		sendAllMarketData(buildMarketDataEntries(response), builderMetadata);

		return response;
	}
}
