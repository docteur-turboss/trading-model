import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import type { TradingSymbol } from "../../domain/market-data-types";
import type { CandleHistoryPort } from "../../domain/ports/candle-history.port";

const MINUTE_MS = 60_000;
const PAGE_LIMIT = 5000;

const Page = z.object({
	rows: z.array(
		z.object({
			source: z.string(),
			market: z.string(),
			interval: z.string(),
			open: z.number(),
			high: z.number(),
			low: z.number(),
			close: z.number(),
			volume: z.number(),
			trades: z.number().int().optional(),
			timestamp: z.iso.datetime(),
			closeTimestamp: z.iso.datetime(),
		})
	),
	nextCursor: z.string().nullable(),
});

/**
 * Reads candles through the scraper's keyset-paged route
 * `GET /candles/symbols/:symbol`: MySQL, not the bus, is the dataset (ADR-0044).
 */
export class ScraperCandleHistory implements CandleHistoryPort {
	private readonly _http: HttpClient;

	constructor(
		tls: TlsPaths,
		private readonly _find: (
			name: ServiceInstanceName
		) => Promise<HostPort | undefined>
	) {
		this._http = HttpClient.createWithTls(tls);
	}

	async loadWindow(
		symbol: TradingSymbol,
		at: number,
		size: number
	): Promise<CandleData[]> {
		const target = await this._find(
			ServiceInstanceName.FinancialScraperService
		);
		if (!target) {
			throw new Error("financial-scraper is not registered in discovery");
		}
		const base = `https://${HostPort.toAddress(target)}/candles/symbols/${symbol}`;
		const window = `from=${new Date(at - size * MINUTE_MS).toISOString()}&to=${new Date(at).toISOString()}&limit=${PAGE_LIMIT}`;
		const candles: CandleData[] = [];
		let after = "";
		do {
			const page = await this._http.get(
				URLString.of(`${base}?${window}${after}`),
				undefined,
				Page
			);
			if (!page) {
				throw new Error(`Empty candle page for ${symbol}`);
			}
			for (const row of page.rows) {
				const closeTimestamp = Date.parse(row.closeTimestamp);
				// One interval, and only candles closed by `at`; one per open time.
				if (row.interval !== CandleInterval.Min1 || closeTimestamp > at) {
					continue;
				}
				const timestamp = Date.parse(row.timestamp);
				if (candles[candles.length - 1]?.timestamp === timestamp) {
					continue;
				}
				candles.push({
					...row,
					symbol,
					timestamp,
					closeTimestamp,
				} as unknown as CandleData);
			}
			after = page.nextCursor ? `&after=${page.nextCursor}` : "";
		} while (after);
		return candles.slice(-size);
	}
}
