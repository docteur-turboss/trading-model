import { MarketEvent } from "@trading-model/common/contracts/market-events";
import {
	CandleInterval,
	MarketType,
	SourceType,
} from "@trading-model/common/contracts/market-data.types";
import {
	PriceSchema,
	VolumeSchema,
} from "@trading-model/common/domain/primitives.schema";
import { z } from "zod";

const SET_OBJECT = z.object({
	price: PriceSchema,
	quantity: VolumeSchema,
});

const MARKET_IDENTITY = {
	symbol: z.string("Symbol is required and must be a string"),
	timestamp: z.number("Timestamp is required and must be a number"),
	source: z.enum(
		SourceType,
		`Source is required and must be part of: ${Object.values(SourceType).join(", ")}`
	),
	market: z.enum(
		MarketType,
		`Market is required and must be part of: ${Object.values(MarketType).join(", ")}`
	),
} as const;

export const MARKET_EVENT_VALIDATORS = {
	[MarketEvent.exampleEvent]: z.void(),
	[MarketEvent.testEvent]: z.object({
		debug: z.boolean("Debug must be a boolean and is required"),
	}),
	[MarketEvent.fetchRecentTrades]: z.object({
		trades: z.array(
			z.object({
				price: PriceSchema,
				tradeId: z.bigint("TradeId is required and must be a bigint"),
				quantity: VolumeSchema,
				side: z.enum(
					["buy", "sell"],
					"Side is required and must be `buy` or `sell`"
				),
				...MARKET_IDENTITY,
			}),
			"Trades is required and must be a array of object"
		),
	}),
	[MarketEvent.fetch24hrTickerStats]: z.object({
		ticker: z.array(
			z.object({
				low: PriceSchema,
				open: PriceSchema,
				high: PriceSchema,
				last: PriceSchema,
				volume: VolumeSchema,
				closeTimestamp: z.number(
					"CloseTimestamp is required and must be a number"
				),
				...MARKET_IDENTITY,
			}),
			"Ticker is required and must be a array of object"
		),
	}),
	[MarketEvent.fetchCandlestickSeries]: z.object({
		candle: z.array(
			z.object({
				low: PriceSchema,
				trades: z.number("Trades must be a number").optional(),
				open: PriceSchema,
				high: PriceSchema,
				close: PriceSchema,
				volume: VolumeSchema,
				interval: z.enum(
					Object.values(CandleInterval) as unknown as [
						CandleInterval,
						...CandleInterval[],
					],
					"Interval is required and must be a valid candlestick interval"
				),
				closeTimestamp: z.number(
					"CloseTimestamp is required and must be a number"
				),
				...MARKET_IDENTITY,
			}),
			"Candle is required and must be a array of object"
		),
	}),
	[MarketEvent.fetchOrderBookSnapshot]: z.object({
		orderBook: z.array(
			z.object({
				bids: z.set(SET_OBJECT),
				asks: z.set(SET_OBJECT),
				...MARKET_IDENTITY,
			}),
			"OrderBook is required and must be a array of object"
		),
	}),
	[MarketEvent.fetchPriceTickerSnapshot]: z.object({
		price: z.record(
			z.string("Symbol value must be string"),
			PriceSchema,
			"Price param is required and must be a record<string, number>"
		),
	}),
	[MarketEvent.fetchOrderBookTickerSnapshot]: z.object({
		bookTicker: z.array(
			z.object({
				ask: PriceSchema,
				bid: PriceSchema,
				askQty: VolumeSchema,
				bidQty: VolumeSchema,
				...MARKET_IDENTITY,
			}),
			"BookTicker is required and must be a array of object"
		),
	}),
};
