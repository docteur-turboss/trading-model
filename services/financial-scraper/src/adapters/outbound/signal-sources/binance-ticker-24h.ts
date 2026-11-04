import { z } from "zod";
import type { SourceAdapter } from "../../../domain/ports/signal-source.port";

const Decimal = z
	.string()
	.regex(/^-?\d+(\.\d+)?$/)
	.transform(Number);

/** `GET /api/v3/ticker/24hr?symbol=<pair>`: rolling 24 h statistics of one pair. */
const Ticker24h = z.object({
	symbol: z.string().min(1),
	lastPrice: Decimal,
	volume: Decimal,
	closeTime: z.number().int().positive(),
});

/**
 * Binance public market data (ADR-0026: no account, no key): last price and
 * 24 h volume of a pair. The payload does not name the assets of the pair,
 * so each request gives them for the units.
 */
export const BINANCE_TICKER_24H: SourceAdapter = {
	params: z.object({
		baseAsset: z.string().min(1),
		quoteAsset: z.string().min(1),
	}),
	normalize(payload, { params }) {
		const ticker = Ticker24h.parse(payload);
		const common = {
			observedAt: ticker.closeTime,
			key: String(ticker.closeTime),
			attributes: { symbol: ticker.symbol },
		};
		return [
			{
				...common,
				metric: "last_price",
				value: ticker.lastPrice,
				unit: params.quoteAsset,
			},
			{
				...common,
				metric: "volume_24h",
				value: ticker.volume,
				unit: params.baseAsset,
			},
		];
	},
};
