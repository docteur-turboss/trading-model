import type { BaseSymbolState, SymbolNormalizers } from "./market-data-types";

type NormJSON<Type> = Type extends NormalizationStats
	? ReturnType<NormalizationStats["toJSON"]>
	: { [Key in keyof Type]: NormJSON<Type[Key]> };

type NormalizationStats = import("./normalization-stats").NormalizationStats;

export interface SymbolStateSerializable extends BaseSymbolState {
	norm: NormJSON<SymbolNormalizers>;
}
