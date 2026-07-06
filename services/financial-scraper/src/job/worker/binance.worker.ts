/**
 * BinanceWorker
 * -------------
 * Orchestration-oriented worker intended to be executed via node-cron.
 *
 * Responsibilities:
 *  - Orchestrating Binance API calls
 *  - Data normalization
 *  - Returning a unified payload ready for persistence
 *
 * The worker is deliberately stateless to simplify usage
 * in distributed environments.
 */

import { createHash, randomUUID } from "node:crypto";

import { HELPER } from "@trading-model/broker-message";
import type { MessageMetadata } from "@trading-model/broker-message/shared/helper/messages/message";
import type { CandleInterval } from "@trading-model/common/config/event.types";
import {
	DeliveryMode,
	type DeliveryMode,
} from "@trading-model/common/config/delivery-mode.types";
import { EnumEventMessage } from "@trading-model/common/config/event.types";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";

import {
	get24hrTickerStats,
	getCandlestickData,
	getOrderBook,
	getOrderBookTicker,
	getRecentTrades,
	getSymbolPriceTicker,
} from "../../clients/binance/binance.client";
import { BinanceNormalizer } from "../../clients/binance/normalizer";
import { env } from "../../config/env";
import { MessageManager } from "../../config/message-manager";

/** Configuration options for a single BinanceWorker execution against one symbol. */
export interface BinanceWorkerOptions {
	symbol: string;
	interval?: CandleInterval;
	candleLimit?: number;
	tradeLimit?: number;
	orderBookLimit?: number;
	deliveryMode?: DeliveryMode;
}

/** Normalized market data returned by a BinanceWorker execution, ready for persistence. */
export interface BinanceWorkerResult {
	orderBook?: ReturnType<typeof BinanceNormalizer.orderBook>;
	recentTrades?: ReturnType<typeof BinanceNormalizer.trades>;
	candles?: ReturnType<typeof BinanceNormalizer.candles>;
	ticker24h?: ReturnType<typeof BinanceNormalizer.ticker24h>;
	priceTicker?: ReturnType<typeof BinanceNormalizer.priceTicker>;
	bookTicker?: ReturnType<typeof BinanceNormalizer.bookTicker>;
	fetchedAt: number;
}

export interface MarketDataContext {
	data: unknown;
	topic: string;
	eventType: string;
	builder: MessageMetadata;
}

export class BinanceWorker {
	constructor(private readonly _options: BinanceWorkerOptions) {}

	/**
	 * Main worker execution.
	 * Can be directly invoked from node-cron.
	 *
	 */
	public async run(): Promise<BinanceWorkerResult> {
		const builderMetadata = new HELPER.metadataBuilder();
		const opts = this._options;

		const rawData = await _fetchAllRawData(opts);
		const response = _buildResponse(opts.symbol, opts.interval, rawData);

		this._configureMetadata(builderMetadata);
		_sendAllMarketData(
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
}

interface RawBinanceData {
	orderBookRaw: Awaited<ReturnType<typeof getOrderBook>>;
	tradesRaw: Awaited<ReturnType<typeof getRecentTrades>>;
	candlesRaw: Awaited<ReturnType<typeof getCandlestickData>>;
	ticker24hRaw: Awaited<ReturnType<typeof get24hrTickerStats>>;
	priceTickerRaw: Awaited<ReturnType<typeof getSymbolPriceTicker>>;
	bookTickerRaw: Awaited<ReturnType<typeof getOrderBookTicker>>;
}

async function _fetchAllRawData(
	opts: BinanceWorkerOptions
): Promise<RawBinanceData> {
	const { symbol, candleLimit = 100, tradeLimit = 100, orderBookLimit = 100 } = opts;
	const interval = opts.interval ?? "1m";

	const [
		orderBookRaw,
		tradesRaw,
		candlesRaw,
		ticker24hRaw,
		priceTickerRaw,
		bookTickerRaw,
	] = await Promise.all([
		getOrderBook(symbol, orderBookLimit),
		getRecentTrades(symbol, tradeLimit),
		getCandlestickData({ symbol, limit: candleLimit, interval }),
		get24hrTickerStats([symbol]),
		getSymbolPriceTicker([symbol]),
		getOrderBookTicker([symbol]),
	]);

	return { orderBookRaw, tradesRaw, candlesRaw, ticker24hRaw, priceTickerRaw, bookTickerRaw };
}

function _buildResponse(
	symbol: string,
	interval: string | undefined,
	raw: RawBinanceData
): BinanceWorkerResult {
	return {
		orderBook: BinanceNormalizer.orderBook(symbol, raw.orderBookRaw),
		recentTrades: BinanceNormalizer.trades(symbol, raw.tradesRaw),
		candles: BinanceNormalizer.candles(symbol, interval ?? "1m", raw.candlesRaw),
		ticker24h: BinanceNormalizer.ticker24h(raw.ticker24hRaw),
		priceTicker: BinanceNormalizer.priceTicker(raw.priceTickerRaw),
		bookTicker: BinanceNormalizer.bookTicker(raw.bookTickerRaw),
		fetchedAt: Date.now(),
	};
}

export class BinanceWorker {

	private _configureMetadata(builder: typeof HELPER.metadataBuilder.prototype): void {
		const authContext = {
			roles: ["Data", "Financial", "Scraper"],
			subject: env.SERVICE_NAME,
			tenantId: env.INSTANCE_ID,
		};

		const signature = createHash("sha256")
			.update(deterministicStringify(authContext))
			.digest("base64url");

		builder
			.setDelivery({
				mode: this._options.deliveryMode ?? DeliveryMode.AT_LEAST_ONCE,
				deduplicationId: randomUUID(),
			})
			.setEventType("FetchCandlestick")
			.setTopic(EnumEventMessage.fetchCandlestickSeries)
			.setSecurity({
				authContext,
				signature,
			})
			.setIds({
				causationId: randomUUID(),
				correlationId: randomUUID(),
			})
			.setPublisher({
				instanceId: env.INSTANCE_ID,
				serviceName: env.SERVICE_NAME as ServiceInstanceName,
			});
	}

	private _buildMarketDataEntries(response: BinanceWorkerResult): {
		data: unknown;
		topic: string;
		eventType: string;
	}[] {
		return [
			{
				data: response.candles,
				topic: EnumEventMessage.fetchCandlestickSeries,
				eventType: "FetchCandlestick",
			},
			{
				data: response.orderBook,
				topic: EnumEventMessage.fetchOrderBookSnapshot,
				eventType: "FetchOrderbook",
			},
			{
				data: response.ticker24h,
				topic: EnumEventMessage.fetch24hrTickerStats,
				eventType: "FetchTicker24hr",
			},
			{
				data: response.bookTicker,
				topic: EnumEventMessage.fetchOrderBookTickerSnapshot,
				eventType: "FetchBookTicker",
			},
			{
				data: response.priceTicker,
				topic: EnumEventMessage.fetchPriceTickerSnapshot,
				eventType: "FetchPriceTicker",
			},
			{
				data: response.recentTrades,
				topic: EnumEventMessage.fetchRecentTrades,
				eventType: "FetchRecentTrades",
			},
		];
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
}
