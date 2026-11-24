import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { HttpClient } from "@trading-model/http/http-client";
import {
	DurationMs,
	ServiceId,
	URLString,
} from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { HARD_CEILINGS } from "../../domain/limits";
import type { MarketPrice, PricePort } from "../../domain/ports";

/**
 * Two attempts of 2 s plus one backoff (≤ 240 ms): ≤ 4.24 s, under the 5 s
 * default `submitTimeoutMs` that bounds the call. The client defaults
 * (10 s × 4 attempts) let the deadline fire first, with no retry ever useful.
 */
const PRICE_TIMEOUT_MS = DurationMs.of(2_000);
const PRICE_RETRY_COUNT = 1;

const Page = z.object({
	rows: z.array(
		z.object({
			symbol: z.string(),
			close: z.number().positive(),
			closeTimestamp: z.iso.datetime(),
		})
	),
});

/**
 * Last closed candle of each symbol from financial-scraper
 * (`GET /v2/candles/latest`, one call for all symbols, ADR-0064 §7): its close
 * is the price, its close time the age. A candle closed before the longest
 * halt threshold is dropped: an older price is stale anyway.
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
		const page = await this._http.get(
			URLString.of(
				`https://${HostPort.toAddress(target)}/v2/candles/latest?symbols=${encodeURIComponent(symbols.join(","))}`
			),
			{
				serviceName: ServiceId.of("financial-scraper"),
				timeoutMs: PRICE_TIMEOUT_MS,
				retryCount: PRICE_RETRY_COUNT,
			},
			Page
		);
		const now = this._now();
		const oldest = now - HARD_CEILINGS.haltAgeMs;
		for (const row of page?.rows ?? []) {
			const at = Date.parse(row.closeTimestamp);
			if (at >= oldest && at <= now) {
				prices[row.symbol] = { price: row.close, at };
			}
		}
		return prices;
	}
}
