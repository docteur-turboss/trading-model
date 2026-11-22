import type { Signal } from "@trading-model/contracts/wire/signals";

/** Stored signals of an asset, served by the scraper (ADR-0036). */
export interface SignalHistoryPort {
	/**
	 * Every signal of `assetId` (own, sector and area) observed in
	 * `[from, to]` (epoch ms), oldest first, no duplicate: nothing observed
	 * after `to` is read (point-in-time, ADR-0030).
	 */
	loadWindow(assetId: string, from: number, to: number): Promise<Signal[]>;
}
