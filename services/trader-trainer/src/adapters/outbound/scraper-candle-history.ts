import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { HttpClient } from "@trading-model/http/http-client";
import { fetchCandlePages } from "@trading-model/http/signals/candle-pages";
import { HostPort } from "@trading-model/primitives/service-identity";
import type { TradingSymbol } from "../../domain/market-data-types";
import type { CandleHistoryPort } from "../../domain/ports/candle-history.port";

const MINUTE_MS = 60_000;
const PAGE_LIMIT = 5000;

/**
 * Reads candles through the scraper's keyset-paged route
 * `GET /v2/candles/symbols/:symbol`: MySQL, not the bus, is the dataset (ADR-0044).
 */
export class ScraperCandleHistory implements CandleHistoryPort {
	private readonly _http: HttpClient;

	constructor(
		tls: TlsPaths,
		private readonly _find: (name: ServiceInstanceName) => Promise<HostPort>
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
		const base = `https://${HostPort.toAddress(target)}/v2/candles/symbols/${symbol}`;
		const window = `from=${new Date(at - size * MINUTE_MS).toISOString()}&to=${new Date(at).toISOString()}&limit=${PAGE_LIMIT}`;
		const candles: CandleData[] = [];
		for await (const row of fetchCandlePages(
			this._http,
			`${base}?${window}`,
			symbol
		)) {
			// One interval, and only candles closed by `at`; one per open time.
			if (
				row.interval === CandleInterval.Min1 &&
				row.closeTimestamp <= at &&
				candles[candles.length - 1]?.timestamp !== row.timestamp
			) {
				candles.push(row);
			}
		}
		return candles.slice(-size);
	}
}
