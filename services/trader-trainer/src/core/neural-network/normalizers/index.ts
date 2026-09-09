import { NormalisationType } from "../type";
import { BORDER } from "./border";
import { DECIMAL_SCALING } from "./decimal-scaling";
import { LOGARITHMIC } from "./logarithmic";
import { MIN_MAX } from "./min-max";
import { NONE_NORMALIZER } from "./none";
import type { Normalizer } from "./normalizer-interface";
import { ROBUST_SCALING } from "./robust-scaling";
import { Z_SCORE } from "./z-score";

export type {
	DataSlice,
	NormalizeParams,
	Normalizer,
} from "./normalizer-interface";

export {
	BORDER,
	DECIMAL_SCALING,
	LOGARITHMIC,
	MIN_MAX,
	NONE_NORMALIZER,
	ROBUST_SCALING,
	Z_SCORE,
};

export const NORMALIZERS: Record<NormalisationType, Normalizer> = {
	[NormalisationType.DecimalScaling]: DECIMAL_SCALING,
	[NormalisationType.LogarithmicNormalization]: LOGARITHMIC,
	[NormalisationType.MinMax]: MIN_MAX,
	[NormalisationType.RobustScaling]: ROBUST_SCALING,
	[NormalisationType.ZScore]: Z_SCORE,
	[NormalisationType.None]: NONE_NORMALIZER,
	[NormalisationType.Border]: BORDER,
};
