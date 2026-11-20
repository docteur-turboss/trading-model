import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import {
	type CandleData,
	CandleInterval,
} from "@trading-model/contracts/market-data.types";
import { HttpClient } from "@trading-model/http/http-client";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";

const PAGE_LIMIT = 5000;

const Page = z.object({
	rows: z.array(
		z.object({
			interval: z.string(),
			open: z.number(),
			high: z.number(),
			low: z.number(),
			close: z.number(),
			volume: z.number(),
			timestamp: z.iso.datetime(),
			closeTimestamp: z.iso.datetime(),
		})
	),
	nextCursor: z.string().nullable(),
});

/**
 * Reads one-minute candles through financial-scraper's keyset-paged route
 * `GET /v2/candles/symbols/:symbol` (ADR-0044, ADR-0054), as the trainer does.
 */
export class ScraperClient {
	private readonly _http: HttpClient;

	constructor(tls: TlsPaths) {
		this._http = HttpClient.createWithTls(tls);
	}

	/** Candles opened in [from, to), one per open time, oldest first. */
	async candles(
		symbol: string,
		from: number,
		to: number
	): Promise<CandleData[]> {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.FinancialScraperService
		);
		const base = `https://${HostPort.toAddress(target)}/v2/candles/symbols/${symbol}?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}&limit=${PAGE_LIMIT}`;
		const candles: CandleData[] = [];
		let after = "";
		do {
			const page = await this._http.get(
				URLString.of(`${base}${after}`),
				{ serviceName: ServiceId.of("financial-scraper") },
				Page
			);
			if (!page) {
				throw new Error(`Empty candle page for ${symbol}`);
			}
			for (const row of page.rows) {
				const timestamp = Date.parse(row.timestamp);
				if (
					row.interval !== CandleInterval.Min1 ||
					candles[candles.length - 1]?.timestamp === timestamp
				) {
					continue;
				}
				candles.push({
					...row,
					symbol,
					timestamp,
					closeTimestamp: Date.parse(row.closeTimestamp),
				} as unknown as CandleData);
			}
			after = page.nextCursor ? `&after=${page.nextCursor}` : "";
		} while (after);
		return candles;
	}
}
