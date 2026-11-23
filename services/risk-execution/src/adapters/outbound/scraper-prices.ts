import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { HttpClient } from "@trading-model/http/http-client";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { HARD_CEILINGS } from "../../domain/limits";
import type { MarketPrice, PricePort } from "../../domain/ports";

const Page = z.object({
	rows: z.array(
		z.object({
			close: z.number().positive(),
			closeTimestamp: z.iso.datetime(),
		})
	),
});

/**
 * Last closed candle of each symbol from financial-scraper
 * (`GET /v2/candles/symbols/:symbol`, ADR-0064 §7): its close is the price,
 * its close time the age. Only candles opened within the longest halt
 * threshold are read: an older price is stale anyway.
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
		const now = this._now();
		const from = new Date(now - HARD_CEILINGS.haltAgeMs).toISOString();
		const prices: Record<string, MarketPrice> = {};
		await Promise.all(
			symbols.map(async (symbol) => {
				const page = await this._http.get(
					URLString.of(
						`https://${HostPort.toAddress(target)}/v2/candles/symbols/${encodeURIComponent(symbol)}?from=${from}`
					),
					{ serviceName: ServiceId.of("financial-scraper") },
					Page
				);
				for (const row of page?.rows ?? []) {
					const at = Date.parse(row.closeTimestamp);
					// A candle still open has a close time in the future: not a price yet.
					if (at <= now && at > (prices[symbol]?.at ?? 0)) {
						prices[symbol] = { price: row.close, at };
					}
				}
			})
		);
		return prices;
	}
}
