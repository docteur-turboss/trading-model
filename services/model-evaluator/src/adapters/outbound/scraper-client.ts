import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import {
	BaseMarketDataShape,
	OhlcvShape,
} from "@trading-model/common/shared/schemas/market-data-schema";
import {
	type CandleData,
	CandleInterval,
} from "@trading-model/contracts/market-data.types";
import { HttpClient } from "@trading-model/http/http-client";
import { ScraperSignalHistory } from "@trading-model/http/signals/scraper-signal-history";
import { SignalBarHistory } from "@trading-model/http/signals/signal-bar-history";
import { DAY_MS } from "@trading-model/model-runtime/features/feature-builder";
import {
	ServiceId,
	toSymbol,
	UnixTimestamp,
	URLString,
} from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";

const PAGE_LIMIT = 5000;

const Page = z.object({
	rows: z.array(
		z.object({
			source: BaseMarketDataShape.source,
			market: BaseMarketDataShape.market,
			interval: z.string(),
			...OhlcvShape,
			timestamp: z.iso.datetime(),
			closeTimestamp: z.iso.datetime(),
		})
	),
	nextCursor: z.string().nullable(),
});

/**
 * Reads one-minute candles through financial-scraper's keyset-paged route
 * `GET /v2/candles/symbols/:symbol` (ADR-0044, ADR-0054), and daily bars
 * rebuilt from the signals (ADR-0083), as the trainer does.
 */
export class ScraperClient {
	private readonly _http: HttpClient;
	private readonly _daily: SignalBarHistory;

	constructor(tls: TlsPaths) {
		this._http = HttpClient.createWithTls(tls);
		// No asset-type map: every asset reads as equity (market label only, no effect on replay).
		this._daily = new SignalBarHistory(
			new ScraperSignalHistory(tls, FIND_A_SERVICE),
			new Map()
		);
	}

	/** Bars opened in [from, to), one per open time, oldest first. */
	async candles(
		symbol: string,
		from: number,
		to: number,
		intervalMs: number,
		signal?: AbortSignal
	): Promise<CandleData[]> {
		signal?.throwIfAborted();
		if (intervalMs === DAY_MS) {
			// The history ends at `to`; its size only has to reach back to `from`.
			const bars = await this._daily.loadWindow(
				toSymbol(symbol),
				to,
				Math.ceil((to - from) / DAY_MS) + 1
			);
			// shortcut: SignalBarHistory takes no signal, so a slow read is only caught after it returns.
			signal?.throwIfAborted();
			return bars.filter((bar) => bar.timestamp >= from);
		}
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.FinancialScraperService
		);
		const base = `https://${HostPort.toAddress(target)}/v2/candles/symbols/${symbol}?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}&limit=${PAGE_LIMIT}`;
		const candles: CandleData[] = [];
		let after = "";
		do {
			const page = await this._http.get(
				URLString.of(`${base}${after}`),
				{ serviceName: ServiceId.of("financial-scraper"), signal },
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
					interval: CandleInterval.Min1,
					symbol: toSymbol(symbol),
					timestamp: UnixTimestamp.of(timestamp),
					closeTimestamp: UnixTimestamp.of(Date.parse(row.closeTimestamp)),
				});
			}
			after = page.nextCursor ? `&after=${page.nextCursor}` : "";
		} while (after);
		return candles;
	}
}
