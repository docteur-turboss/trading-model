import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import {
	type CandleData,
	CandleInterval,
} from "@trading-model/contracts/market-data.types";
import {
	ServiceId,
	TradingSymbol,
	URLString,
} from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { HttpClient } from "../http-client";
import { ScraperSignalHistory } from "../signals/scraper-signal-history";
import { SignalBarHistory } from "../signals/signal-bar-history";

const DAY_MS = 86_400_000;
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
 * `GET /v2/candles/symbols/:symbol` (ADR-0044, ADR-0054), and daily bars
 * rebuilt from the signals (ADR-0083), as the trainer does.
 */
export class ScraperClient {
	private readonly _http: HttpClient;
	private readonly _daily: SignalBarHistory;

	constructor(
		tls: TlsPaths,
		private readonly _find: (name: ServiceInstanceName) => Promise<HostPort>
	) {
		this._http = HttpClient.createWithTls(tls);
		// No asset-type map: every asset reads as equity (market label only, no effect on replay).
		this._daily = new SignalBarHistory(
			new ScraperSignalHistory(tls, _find),
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
				TradingSymbol.of(symbol),
				to,
				Math.ceil((to - from) / DAY_MS) + 1
			);
			// shortcut: SignalBarHistory takes no signal, so a slow read is only caught after it returns.
			signal?.throwIfAborted();
			return bars.filter((bar) => bar.timestamp >= from);
		}
		const target = await this._find(
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
