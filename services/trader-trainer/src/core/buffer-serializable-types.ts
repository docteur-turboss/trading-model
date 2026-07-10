import type { BaseSymbolState, SymbolNormalizers } from "./market-data-types";

type NormJSON<T> = T extends NormalizationStats
	? ReturnType<NormalizationStats["toJSON"]>
	: { [K in keyof T]: NormJSON<T[K]> };

type NormalizationStats = import("./normalization-stats").NormalizationStats;

export interface SymbolStateSerializable extends BaseSymbolState {
	norm: NormJSON<SymbolNormalizers>;
}
