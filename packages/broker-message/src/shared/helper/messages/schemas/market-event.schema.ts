import {
	BaseMarketDataShape,
	BidAskShape,
	OhlcvShape,
	OhlcvTickerShape,
} from "@trading-model/common/domain/market-data-schema";
import {
	PriceSchema,
	VolumeSchema,
} from "@trading-model/common/domain/primitives.schema";
import {
	type CandleInterval,
	candleIntervalValues,
	type TradeSide,
	tradeSideValues,
} from "@trading-model/validation/contracts/market-data.types";
import { MarketEvent } from "@trading-model/validation/contracts/market-events";
import { z } from "zod";

const SET_OBJECT = z.object({
	price: PriceSchema,
	quantity: VolumeSchema,
});

export const MARKET_EVENT_VALIDATORS = {
	[MarketEvent.ExampleEvent]: z.void(),
	[MarketEvent.TestEvent]: z.object({
		debug: z.boolean("Debug must be a boolean and is required"),
	}),
	[MarketEvent.FetchRecentTrades]: z.object({
		trades: z.array(
			z.object({
				price: PriceSchema,
				tradeId: z.bigint("TradeId is required and must be a bigint"),
				quantity: VolumeSchema,
				side: z.enum(
					tradeSideValues() as [TradeSide, ...TradeSide[]],
					"Side is required and must be `buy` or `sell`"
				),
				...BaseMarketDataShape,
			}),
			"Trades is required and must be a array of object"
		),
	}),
	[MarketEvent.Fetch24hrTickerStats]: z.object({
		ticker: z.array(
			z.object({
				...OhlcvTickerShape,
				closeTimestamp: z.number(
					"CloseTimestamp is required and must be a number"
				),
				...BaseMarketDataShape,
			}),
			"Ticker is required and must be a array of object"
		),
	}),
	[MarketEvent.FetchCandlestickSeries]: z.object({
		candle: z.array(
			z.object({
				...OhlcvShape,
				trades: z.number("Trades must be a number").optional(),
				interval: z.enum(
					candleIntervalValues() as [CandleInterval, ...CandleInterval[]],
					"Interval is required and must be a valid candlestick interval"
				),
				closeTimestamp: z.number(
					"CloseTimestamp is required and must be a number"
				),
				...BaseMarketDataShape,
			}),
			"Candle is required and must be a array of object"
		),
	}),
	[MarketEvent.FetchOrderBookSnapshot]: z.object({
		orderBook: z.array(
			z.object({
				bids: z.set(SET_OBJECT),
				asks: z.set(SET_OBJECT),
				...BaseMarketDataShape,
			}),
			"OrderBook is required and must be a array of object"
		),
	}),
	[MarketEvent.FetchPriceTickerSnapshot]: z.object({
		price: z.record(
			z.string("Symbol value must be string"),
			PriceSchema,
			"Price param is required and must be a record<string, number>"
		),
	}),
	[MarketEvent.FetchOrderBookTickerSnapshot]: z.object({
		bookTicker: z.array(
			z.object({
				...BidAskShape,
				...BaseMarketDataShape,
			}),
			"BookTicker is required and must be a array of object"
		),
	}),
};
