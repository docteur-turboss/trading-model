import type { Signal } from "../signals";

export interface AssetSignalsQuery {
	assetId: string;
	/** Sector of the asset: its sector signals are part of the answer. */
	sector: string;
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
	/** Signals of the asset and of its sector observed in [from, to), oldest first, at most `limit`. */
	findForAsset(query: AssetSignalsQuery): Promise<Signal[]>;
}
