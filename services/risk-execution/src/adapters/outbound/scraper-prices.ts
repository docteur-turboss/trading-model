import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { HttpClient } from "@trading-model/http/http-client";
import { isHttpClientError } from "@trading-model/http/http-client-errors";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { HARD_CEILINGS } from "../../domain/limits";
import type { MarketPrice, PricePort } from "../../domain/ports";

const Row = z.object({
	close: z.number().positive(),
	closeTimestamp: z.iso.datetime(),
});
const Page = z.object({ rows: z.array(Row.extend({ symbol: z.string() })) });
const SymbolPage = z.object({ rows: z.array(Row) });

/**
 * Last closed candle of each symbol from financial-scraper
 * (`GET /v2/candles/latest`, one call for all symbols, ADR-0064 §7): its close
 * is the price, its close time the age. A candle closed before the longest
 * halt threshold is dropped: an older price is stale anyway. On a 404 (release
 * N-1 of financial-scraper) it falls back to one
 * `GET /v2/candles/symbols/:symbol` per symbol.
 */
export class ScraperPrices implements PricePort {
	private readonly _http: HttpClient;

	constructor(
		tls: TlsPaths,
		private readonly _now: () => number = Date.now
	) {
		this._http = HttpClient.createWithTls(tls);
	}

	async latest(
		symbols: readonly string[]
	): Promise<Record<string, MarketPrice>> {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.FinancialScraperService
		);
		const prices: Record<string, MarketPrice> = {};
		if (symbols.length === 0) {
			return prices;
		}
		const address = HostPort.toAddress(target);
		const options = { serviceName: ServiceId.of("financial-scraper") };
		const now = this._now();
		const oldest = now - HARD_CEILINGS.haltAgeMs;
		const keep = (symbol: string, close: number, closeTimestamp: string) => {
			const at = Date.parse(closeTimestamp);
			// A candle still open has a close time in the future: not a price yet.
			if (at >= oldest && at <= now && at > (prices[symbol]?.at ?? 0)) {
				prices[symbol] = { price: close, at };
			}
		};
		try {
			const page = await this._http.get(
				URLString.of(
					`https://${address}/v2/candles/latest?symbols=${encodeURIComponent(symbols.join(","))}`
				),
				options,
				Page
			);
			for (const row of page?.rows ?? []) {
				keep(row.symbol, row.close, row.closeTimestamp);
			}
		} catch (err) {
			if (!isHttpClientError(err) || err.statusCode !== HTTP_STATUS.NOT_FOUND) {
				throw err;
			}
			// shortcut: repli N-1, à retirer quand toutes les releases déployées servent /v2/candles/latest (#2597).
			const from = new Date(oldest).toISOString();
			await Promise.all(
				symbols.map(async (symbol) => {
					const page = await this._http.get(
						URLString.of(
							`https://${address}/v2/candles/symbols/${encodeURIComponent(symbol)}?from=${from}`
						),
						options,
						SymbolPage
					);
					for (const row of page?.rows ?? []) {
						keep(symbol, row.close, row.closeTimestamp);
					}
				})
			);
		}
		return prices;
	}
}
