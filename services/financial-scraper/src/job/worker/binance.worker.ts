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
import {
	DeliveryMode,
	type DeliveryModeEnum,
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
	interval?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
	candleLimit?: number;
	tradeLimit?: number;
	orderBookLimit?: number;
	deliveryMode?: DeliveryModeEnum;
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

export class BinanceWorker {
	constructor(private readonly _options: BinanceWorkerOptions) {}

	/**
	 * Main worker execution.
	 * Can be directly invoked from node-cron.
	 *
	 */
	public async run(): Promise<BinanceWorkerResult> {
		const builderMetadata = new HELPER.metadataBuilder();

		const {
			symbol,
			interval = "1m",
			candleLimit = 100,
			tradeLimit = 100,
			orderBookLimit = 100,
		} = this._options;

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
			getCandlestickData(symbol, candleLimit, interval),
			get24hrTickerStats([symbol]),
			getSymbolPriceTicker([symbol]),
			getOrderBookTicker([symbol]),
		]);

		const response = {
			orderBook: BinanceNormalizer.orderBook(symbol, orderBookRaw),
			recentTrades: BinanceNormalizer.trades(symbol, tradesRaw),
			candles: BinanceNormalizer.candles(symbol, interval, candlesRaw),
			ticker24h: BinanceNormalizer.ticker24h(ticker24hRaw),
			priceTicker: BinanceNormalizer.priceTicker(priceTickerRaw),
			bookTicker: BinanceNormalizer.bookTicker(bookTickerRaw),
			fetchedAt: Date.now(),
		};

		this._configureMetadata(builderMetadata);

		const marketDataEntries = this._buildMarketDataEntries(response);

		for (const entry of marketDataEntries) {
			this._sendMarketData(
				entry.data,
				entry.topic,
				entry.eventType,
				builderMetadata
			);
		}

		return response;
	}

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

	private _sendMarketData(
		data: unknown,
		topic: string,
		eventType: string,
		builder: MessageMetadata
	): void {
		builder.setTopic(topic).setEventType(eventType);
		MessageManager.post.indirect(data, builder.toJSON());
	}
}
