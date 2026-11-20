import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
import { SourceQuarantine } from "../../../application/source-quarantine";
import type {
	MarketDataSnapshot,
	SnapshotRequest,
} from "../../../domain/market-data-snapshot";
import type { MarketDataSourcePort } from "../../../domain/ports/market-data-source.port";
import { retryAfterMs } from "../../../domain/retry-after";
import {
	banOf,
	buildResponse,
	fetchAllRawData,
	fetchTickerBatch,
	type TickerBatch,
} from "./binance-data-fetcher";

const BAN_BACKOFF_BASE_MS = 5 * 60_000;

/**
 * Binance public REST API (no account, no key: ADR-0026). A 418 or 451
 * quarantines it at once: no call until the deadline (`Retry-After` or a
 * doubling backoff), since each call during a ban extends it.
 */
export class BinanceMarketDataSource implements MarketDataSourcePort {
	readonly id = DataSource.Binance;
	private _tickers?: TickerBatch;

	constructor(
		private readonly _quarantine = new SourceQuarantine(BAN_BACKOFF_BASE_MS, 1)
	) {}

	beginCycle(symbols: TradingSymbol[]): void {
		this._tickers = this._quarantine.isOpen(this.id)
			? undefined
			: fetchTickerBatch(symbols);
	}

	async fetchSnapshot(request: SnapshotRequest): Promise<MarketDataSnapshot> {
		if (this._quarantine.isOpen(this.id)) {
			throw new Error(
				"Binance quarantined after a 418/451: no call until the deadline"
			);
		}
		let rawData: Awaited<ReturnType<typeof fetchAllRawData>>;
		try {
			rawData = await fetchAllRawData(request, this._tickers);
		} catch (error) {
			const ban = banOf(error);
			if (ban) {
				this._quarantine.fail(
					this.id,
					retryAfterMs(ban.retryAfter, Date.now())
				);
			}
			throw error;
		}
		this._quarantine.clear(this.id);
		return buildResponse(
			{
				symbol: request.symbol,
				interval: request.interval ?? CandleInterval.Min1,
			},
			rawData
		);
	}
}
