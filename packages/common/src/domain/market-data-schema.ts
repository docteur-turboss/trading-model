import { z } from "zod";
import { MarketType, SourceType } from "../contracts/market-data.types";

import { PriceSchema, VolumeSchema } from "./primitives.schema";

export const BaseMarketDataShape = {
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

export const OhlcvShape = {
	low: PriceSchema,
	open: PriceSchema,
	high: PriceSchema,
	close: PriceSchema,
	volume: VolumeSchema,
} as const;

export const OhlcvTickerShape = {
	low: PriceSchema,
	open: PriceSchema,
	high: PriceSchema,
	last: PriceSchema,
	volume: VolumeSchema,
} as const;

export const BidAskShape = {
	bid: PriceSchema,
	ask: PriceSchema,
	bidQty: VolumeSchema,
	askQty: VolumeSchema,
} as const;
