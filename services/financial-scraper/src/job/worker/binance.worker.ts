import { HELPER } from "@trading-model/broker-message";
import type { MessageMetadata } from "@trading-model/broker-message/shared/helper/messages/message";
import { EnumEventMessage } from "@trading-model/common/config/event.types";
import { MessageManager } from "../../config/message-manager";
import type { BinanceWorkerResult } from "./binance-worker-types";
import type { BinanceWorkerOptions } from "./binance-worker-types";
import {
	buildAuthContext,
	buildDeliveryConfig,
	buildIds,
	buildPublisher,
	computeSignature,
	fetchAllRawData,
	buildResponse,
	makeEntry,
	type MarketDataEntry,
} from "./binance-worker-helpers";

export type { BinanceWorkerOptions, BinanceWorkerResult };

export interface MarketDataContext extends MarketDataEntry {
	builder: MessageMetadata;
}

export class BinanceWorker {
	constructor(private readonly _options: BinanceWorkerOptions) {}

	public async run(): Promise<BinanceWorkerResult> {
		const builderMetadata = new HELPER.metadataBuilder();
		const opts = this._options;

		const rawData = await fetchAllRawData(opts);
		const response = buildResponse(opts.symbol, opts.interval, rawData);

		this._configureMetadata(builderMetadata);
		this._sendAllMarketData(
			this._buildMarketDataEntries(response),
			builderMetadata
		);

		return response;
	}

	private _sendAllMarketData(
		entries: ReturnType<BinanceWorker["_buildMarketDataEntries"]>,
		builder: typeof HELPER.metadataBuilder.prototype
	): void {
		for (const entry of entries) {
			this._sendMarketData({
				data: entry.data,
				topic: entry.topic,
				eventType: entry.eventType,
				builder,
			});
		}
	}

	private _sendMarketData({
		data,
		topic,
		eventType,
		builder,
	}: MarketDataContext): void {
		builder.setTopic(topic).setEventType(eventType);
		MessageManager.post.indirect(data, builder.toJSON());
	}

	private _configureMetadata(
		builder: typeof HELPER.metadataBuilder.prototype
	): void {
		const authContext = buildAuthContext();
		const signature = computeSignature(authContext);

		builder
			.setDelivery(buildDeliveryConfig(this._options.deliveryMode))
			.setEventType("FetchCandlestick")
			.setTopic(EnumEventMessage.fetchCandlestickSeries)
			.setSecurity({ authContext, signature })
			.setIds(buildIds())
			.setPublisher(buildPublisher());
	}

	private _buildMarketDataEntries(
		response: BinanceWorkerResult
	): MarketDataEntry[] {
		return [
			makeEntry(
				response.candles,
				EnumEventMessage.fetchCandlestickSeries,
				"FetchCandlestick"
			),
			makeEntry(
				response.orderBook,
				EnumEventMessage.fetchOrderBookSnapshot,
				"FetchOrderbook"
			),
			makeEntry(
				response.ticker24h,
				EnumEventMessage.fetch24hrTickerStats,
				"FetchTicker24hr"
			),
			makeEntry(
				response.bookTicker,
				EnumEventMessage.fetchOrderBookTickerSnapshot,
				"FetchBookTicker"
			),
			makeEntry(
				response.priceTicker,
				EnumEventMessage.fetchPriceTickerSnapshot,
				"FetchPriceTicker"
			),
			makeEntry(
				response.recentTrades,
				EnumEventMessage.fetchRecentTrades,
				"FetchRecentTrades"
			),
		];
	}
}
