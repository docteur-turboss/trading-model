import type { Dimension, Signal } from "@trading-model/contracts/wire/signals";

interface AssetSignalsQuery {
	assetId: string;
	/** Sector of the asset: its sector signals are part of the answer. */
	sector: string;
	/** Economic areas of the asset: their signals are part of the answer. */
	areas: readonly string[];
	/** The asset's applicable dimensions: signals of the others are left out. */
	dimensions: readonly Dimension[];
	/** Only the signals of this source. */
	sourceId?: string;
	/** Only the signals of this metric (`payload.metric`). */
	metric?: string;
	/** Epoch milliseconds, inclusive. */
	from: number;
	/** Epoch milliseconds, exclusive. */
	to: number;
	limit: number;
}

/** Signal persistence (MySQL `signals`, migration 006). */
export interface SignalStorePort {
	/** Stores the signals; one already stored (same id) is left as it was. */
	save(signals: readonly Signal[]): Promise<void>;
	/** Per source: epoch ms of its newest `ingested_at` and of its newest source-dated `observed_at` (null: none). */
	newestBySource(): Promise<
		Map<string, { ingestedAt: number; observedAt: number | null }>
	>;
	/** Signals of the asset and of its sector and areas observed in [from, to), oldest first, at most `limit`. */
	findForAsset(query: AssetSignalsQuery): Promise<Signal[]>;
}
