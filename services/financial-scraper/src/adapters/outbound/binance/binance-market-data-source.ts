import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
import type {
	MarketDataSnapshot,
	SnapshotRequest,
} from "../../../domain/market-data-snapshot";
import type { MarketDataSourcePort } from "../../../domain/ports/market-data-source.port";
import {
	buildResponse,
	fetchAllRawData,
	fetchTickerBatch,
	type TickerBatch,
} from "./binance-data-fetcher";

/** Binance public REST API (no account, no key: ADR-0026). */
export class BinanceMarketDataSource implements MarketDataSourcePort {
	readonly id = DataSource.Binance;
	private _tickers?: TickerBatch;

	beginCycle(symbols: TradingSymbol[]): void {
		this._tickers = fetchTickerBatch(symbols);
	}

	async fetchSnapshot(request: SnapshotRequest): Promise<MarketDataSnapshot> {
		const rawData = await fetchAllRawData(request, this._tickers);
		return buildResponse(
			{
				symbol: request.symbol,
				interval: request.interval ?? CandleInterval.Min1,
			},
			rawData
		);
	}
}
