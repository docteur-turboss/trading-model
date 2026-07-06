import { createHash, randomUUID } from "node:crypto";

import { HELPER } from "@trading-model/broker-message";
import type { MessageMetadata } from "@trading-model/broker-message/shared/helper/messages/message";
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import {
	CandleInterval,
	EnumEventMessage,
} from "@trading-model/common/config/event.types";
import type {
	InstanceId,
	MessageId,
	ServiceId,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import {
	toInstanceId,
	toMessageId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
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

export interface BinanceWorkerOptions {
	symbol: TradingSymbol;
	interval?: CandleInterval;
	candleLimit?: number;
	tradeLimit?: number;
	orderBookLimit?: number;
	deliveryMode?: DeliveryMode;
}

export interface BinanceWorkerResult {
	orderBook?: ReturnType<typeof BinanceNormalizer.orderBook>;
	recentTrades?: ReturnType<typeof BinanceNormalizer.trades>;
	candles?: ReturnType<typeof BinanceNormalizer.candles>;
	ticker24h?: ReturnType<typeof BinanceNormalizer.ticker24h>;
	priceTicker?: ReturnType<typeof BinanceNormalizer.priceTicker>;
	bookTicker?: ReturnType<typeof BinanceNormalizer.bookTicker>;
	fetchedAt: number;
}

interface MarketDataEntry {
	data: unknown;
	topic: string;
	eventType: string;
}

export interface MarketDataContext extends MarketDataEntry {
	builder: MessageMetadata;
}

export class BinanceWorker {
	constructor(private readonly _options: BinanceWorkerOptions) {}

	public async run(): Promise<BinanceWorkerResult> {
		const builderMetadata = new HELPER.metadataBuilder();
		const opts = this._options;

		const rawData = await _fetchAllRawData(opts);
		const response = _buildResponse(opts.symbol, opts.interval, rawData);

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
		const authContext = _buildAuthContext();
		const signature = _computeSignature(authContext);

		builder
			.setDelivery(_buildDeliveryConfig(this._options.deliveryMode))
			.setEventType("FetchCandlestick")
			.setTopic(EnumEventMessage.fetchCandlestickSeries)
			.setSecurity({ authContext, signature })
			.setIds(_buildIds())
			.setPublisher(_buildPublisher());
	}

	private _buildMarketDataEntries(
		response: BinanceWorkerResult
	): MarketDataEntry[] {
		return [
			_makeEntry(
				response.candles,
				EnumEventMessage.fetchCandlestickSeries,
				"FetchCandlestick"
			),
			_makeEntry(
				response.orderBook,
				EnumEventMessage.fetchOrderBookSnapshot,
				"FetchOrderbook"
			),
			_makeEntry(
				response.ticker24h,
				EnumEventMessage.fetch24hrTickerStats,
				"FetchTicker24hr"
			),
			_makeEntry(
				response.bookTicker,
				EnumEventMessage.fetchOrderBookTickerSnapshot,
				"FetchBookTicker"
			),
			_makeEntry(
				response.priceTicker,
				EnumEventMessage.fetchPriceTickerSnapshot,
				"FetchPriceTicker"
			),
			_makeEntry(
				response.recentTrades,
				EnumEventMessage.fetchRecentTrades,
				"FetchRecentTrades"
			),
		];
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
	const {
		symbol,
		candleLimit = 100,
		tradeLimit = 100,
		orderBookLimit = 100,
	} = opts;
	const interval = opts.interval ?? CandleInterval.MIN1;

	const [
		orderBookRaw,
		tradesRaw,
		candlesRaw,
		ticker24hRaw,
		priceTickerRaw,
		bookTickerRaw,
	] = await Promise.all([
		getOrderBook({ symbol, limit: orderBookLimit }),
		getRecentTrades({ symbol, limit: tradeLimit }),
		getCandlestickData({ symbol, limit: candleLimit, interval }),
		get24hrTickerStats([symbol]),
		getSymbolPriceTicker([symbol]),
		getOrderBookTicker([symbol]),
	]);

	return {
		orderBookRaw,
		tradesRaw,
		candlesRaw,
		ticker24hRaw,
		priceTickerRaw,
		bookTickerRaw,
	};
}

function _buildResponse(
	symbol: TradingSymbol,
	interval: CandleInterval | undefined,
	raw: RawBinanceData
): BinanceWorkerResult {
	return {
		orderBook: BinanceNormalizer.orderBook(symbol, raw.orderBookRaw),
		recentTrades: BinanceNormalizer.trades(symbol, raw.tradesRaw),
		candles: BinanceNormalizer.candles(
			symbol,
			interval ?? CandleInterval.MIN1,
			raw.candlesRaw
		),
		ticker24h: BinanceNormalizer.ticker24h(raw.ticker24hRaw),
		priceTicker: BinanceNormalizer.priceTicker(raw.priceTickerRaw),
		bookTicker: BinanceNormalizer.bookTicker(raw.bookTickerRaw),
		fetchedAt: Date.now(),
	};
}

function _makeEntry(
	data: unknown,
	topic: string,
	eventType: string
): MarketDataEntry {
	return { data, topic, eventType };
}

function _buildAuthContext(): {
	roles: string[];
	subject: string;
	tenantId: string;
} {
	return {
		roles: ["Data", "Financial", "Scraper"],
		subject: env.SERVICE_NAME,
		tenantId: env.INSTANCE_ID,
	};
}

function _computeSignature(authContext: unknown): string {
	return createHash("sha256")
		.update(deterministicStringify(authContext))
		.digest("base64url");
}

function _buildDeliveryConfig(
	deliveryMode?: import("@trading-model/common/config/delivery-mode.types").DeliveryMode
): {
	mode: import("@trading-model/common/config/delivery-mode.types").DeliveryMode;
	deduplicationId: MessageId;
} {
	return {
		mode: deliveryMode ?? DeliveryMode.AT_LEAST_ONCE,
		deduplicationId: toMessageId(randomUUID()),
	};
}

function _buildIds(): { causationId: string; correlationId: string } {
	return {
		causationId: randomUUID(),
		correlationId: randomUUID(),
	};
}

function _buildPublisher(): {
	instanceId: InstanceId;
	serviceName: ServiceId;
} {
	return {
		instanceId: toInstanceId(env.INSTANCE_ID),
		serviceName: toServiceId(env.SERVICE_NAME),
	};
}
