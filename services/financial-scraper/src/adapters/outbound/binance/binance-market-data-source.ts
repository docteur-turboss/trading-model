import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { DataSource } from "@trading-model/primitives/primitives";
import type {
	MarketDataSnapshot,
	SnapshotRequest,
} from "../../../domain/market-data-snapshot";
import type { MarketDataSourcePort } from "../../../domain/ports/market-data-source.port";
import { buildResponse, fetchAllRawData } from "./binance-data-fetcher";

/** Binance public REST API (no account, no key: ADR-0026). */
export class BinanceMarketDataSource implements MarketDataSourcePort {
	readonly id = DataSource.Binance;

	async fetchSnapshot(request: SnapshotRequest): Promise<MarketDataSnapshot> {
		const rawData = await fetchAllRawData(request);
		return buildResponse(
			{
				symbol: request.symbol,
				interval: request.interval ?? CandleInterval.Min1,
			},
			rawData
		);
	}
}
