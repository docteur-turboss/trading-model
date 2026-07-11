import { z } from "zod";
import {
	type BaseMarketData,
	type BidAsk,
	type MarketType,
	marketTypeValues,
	type OhlcvData,
	type OhlcvTickerData,
	type SourceType,
	sourceTypeValues,
} from "../contracts/market-data.types";

import { PriceSchema, VolumeSchema } from "./primitives.schema";

export const BaseMarketDataShape = {
	symbol: z.string("Symbol is required and must be a string"),
	timestamp: z.number("Timestamp is required and must be a number"),
	source: z.enum(
		sourceTypeValues() as [SourceType, ...SourceType[]],
		`Source is required and must be part of: ${sourceTypeValues().join(", ")}`
	),
	market: z.enum(
		marketTypeValues() as [MarketType, ...MarketType[]],
		`Market is required and must be part of: ${marketTypeValues().join(", ")}`
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
