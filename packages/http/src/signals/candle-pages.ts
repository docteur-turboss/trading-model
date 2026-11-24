import {
	BaseMarketDataShape,
	OhlcvShape,
} from "@trading-model/common/shared/schemas/market-data-schema";
import {
	type CandleData,
	CandleInterval,
} from "@trading-model/contracts/market-data.types";
import {
	NonNegativeInt,
	ServiceId,
	type TradingSymbol,
	UnixTimestamp,
	URLString,
} from "@trading-model/primitives/primitives";
import { z } from "zod";
import type { HttpClient } from "../http-client";

const Page = z.object({
	rows: z.array(
		z.object({
			source: BaseMarketDataShape.source,
			market: BaseMarketDataShape.market,
			interval: z.enum(
				CandleInterval.values() as [CandleInterval, ...CandleInterval[]]
			),
			...OhlcvShape,
			trades: z.number().int().optional(),
			timestamp: z.iso.datetime(),
			closeTimestamp: z.iso.datetime(),
		})
	),
	nextCursor: z.string().nullable(),
});

/**
 * Walks the keyset pages of the scraper's `GET /v2/candles/symbols/:symbol`
 * (`after` = `nextCursor`, until null) and yields every row as a candle, in
 * route order. `url` carries `from`, `to` and `limit`; the caller filters.
 */
export async function* fetchCandlePages(
	http: HttpClient,
	url: string,
	symbol: TradingSymbol,
	signal?: AbortSignal
): AsyncGenerator<CandleData> {
	let after = "";
	do {
		const page = await http.get(
			URLString.of(`${url}${after}`),
			{ serviceName: ServiceId.of("financial-scraper"), signal },
			Page
		);
		if (!page) {
			throw new Error(`Empty candle page for ${symbol}`);
		}
		for (const row of page.rows) {
			yield {
				...row,
				trades:
					row.trades === undefined ? undefined : NonNegativeInt.of(row.trades),
				symbol,
				timestamp: UnixTimestamp.of(Date.parse(row.timestamp)),
				closeTimestamp: UnixTimestamp.of(Date.parse(row.closeTimestamp)),
			};
		}
		after = page.nextCursor ? `&after=${page.nextCursor}` : "";
	} while (after);
}
