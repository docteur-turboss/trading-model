import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
import {
	type QuarantineStore,
	SourceQuarantine,
} from "../../../application/source-quarantine";
import type {
	MarketDataSnapshot,
	SnapshotRequest,
} from "../../../domain/market-data-snapshot";
import type { MarketDataSourcePort } from "../../../domain/ports/market-data-source.port";
import { retryAfterMs } from "../../../domain/retry-after";
import {
	buildResponse,
	fetchAllRawData,
	fetchTickerBatch,
	type TickerBatch,
} from "./binance-data-fetcher";

const BAN_BACKOFF_BASE_MS = 5 * 60_000;

/**
 * Binance public REST API (no account, no key: ADR-0026). A 429, 418 or 451
 * quarantines it at once: no call until the deadline (`Retry-After` or a
 * doubling backoff), since each call during a ban extends it.
 */
export class BinanceMarketDataSource implements MarketDataSourcePort {
	readonly id = DataSource.Binance;
	private _tickers?: TickerBatch;

	constructor(
		store?: QuarantineStore,
		private readonly _quarantine = new SourceQuarantine(
			BAN_BACKOFF_BASE_MS,
			1,
			undefined,
			store
		)
	) {}

	/** Reads back a ban recorded before a restart or by the previous leader. */
	restore(): Promise<void> {
		return this._quarantine.restore();
	}

	beginCycle(symbols: TradingSymbol[], signal?: AbortSignal): void {
		this._tickers = this._quarantine.isOpen(this.id)
			? undefined
			: fetchTickerBatch(symbols, signal);
	}

	async fetchSnapshot(request: SnapshotRequest): Promise<MarketDataSnapshot> {
		if (this._quarantine.isOpen(this.id)) {
			throw new Error(
				"Binance quarantined after a 429/418/451: no call until the deadline"
			);
		}
		let banned = false;
		const rawData = await fetchAllRawData(request, this._tickers, (ban) => {
			banned = true;
			this._quarantine.fail(this.id, retryAfterMs(ban.retryAfter, Date.now()));
		});
		if (!banned) {
			this._quarantine.clear(this.id);
		}
		return buildResponse(
			{
				symbol: request.symbol,
				interval: request.interval ?? CandleInterval.Min1,
			},
			rawData
		);
	}
}
