import type { DataSource } from "@trading-model/primitives/primitives";
import type {
	MarketDataSnapshot,
	SnapshotRequest,
} from "../market-data-snapshot";

/**
 * A market data provider (Binance today, see ADR-0026). Adding a source means
 * adding an adapter implementing this port; the scrape cycle does not change.
 */
export interface MarketDataSourcePort {
	readonly id: DataSource;
	fetchSnapshot(request: SnapshotRequest): Promise<MarketDataSnapshot>;
}
