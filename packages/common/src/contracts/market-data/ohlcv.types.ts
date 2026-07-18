import type { Price, Volume } from "../../domain/primitives";

export interface OhlcvFields<TPrice, TVolume> {
	open: TPrice;
	high: TPrice;
	low: TPrice;
	close: TPrice;
	volume: TVolume;
}

export interface OhlcvData extends OhlcvFields<Price, Volume> {}
