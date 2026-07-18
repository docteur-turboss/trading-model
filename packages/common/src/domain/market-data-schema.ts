import { z } from "zod";
import {
	type BaseMarketData,
	type BidAsk,
	MarketType,
	type OhlcvData,
	type OhlcvTickerData,
	SourceType,
} from "../contracts/market-data.types";

import { PriceSchema, VolumeSchema } from "./primitives.schema";

export const BaseMarketDataShape = {
	symbol: z.string("Symbol is required and must be a string"),
	timestamp: z.number("Timestamp is required and must be a number"),
	source: z.enum(
		SourceType.values() as [SourceType, ...SourceType[]],
		`Source is required and must be part of: ${SourceType.values().join(", ")}`
	),
	market: z.enum(
		MarketType.values() as [MarketType, ...MarketType[]],
		`Market is required and must be part of: ${MarketType.values().join(", ")}`
	),
} as const satisfies Record<keyof BaseMarketData, z.ZodType>;

export const OhlcvShape = {
	low: PriceSchema,
	open: PriceSchema,
	high: PriceSchema,
	close: PriceSchema,
	volume: VolumeSchema,
} as const satisfies Record<keyof OhlcvData, z.ZodType>;

export const OhlcvTickerShape = {
	low: PriceSchema,
	open: PriceSchema,
	high: PriceSchema,
	last: PriceSchema,
	volume: VolumeSchema,
} as const satisfies Record<keyof OhlcvTickerData, z.ZodType>;

export const BidAskShape = {
	bid: PriceSchema,
	ask: PriceSchema,
	bidQty: VolumeSchema,
	askQty: VolumeSchema,
} as const satisfies Record<keyof BidAsk, z.ZodType>;
