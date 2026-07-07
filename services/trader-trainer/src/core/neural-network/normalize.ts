import { NormalisationType } from "./type";
import { DecimalScalingNormalizer } from "./normalizers/decimal-scaling";
import { LogarithmicNormalizer } from "./normalizers/logarithmic";
import { MinMaxNormalizer } from "./normalizers/min-max";
import { RobustScalingNormalizer } from "./normalizers/robust-scaling";
import { ZScoreNormalizer } from "./normalizers/z-score";
import { NoneNormalizer } from "./normalizers/none";
import { BorderNormalizer } from "./normalizers/border";

export type { NormalizeParams, Normalizer } from "./normalizers/normalizer-interface";

export const DECIMAL_SCALING = new DecimalScalingNormalizer();
export const LOGARITHMIC = new LogarithmicNormalizer();
export const MIN_MAX = new MinMaxNormalizer();
export const ROBUST_SCALING = new RobustScalingNormalizer();
export const Z_SCORE = new ZScoreNormalizer();
export const NONE_NORMALIZER = new NoneNormalizer();
export const BORDER = new BorderNormalizer();

export const NORMALIZERS: Record<NormalisationType, import("./normalizers/normalizer-interface").Normalizer> = {
	[NormalisationType.DecimalScaling]: DECIMAL_SCALING,
	[NormalisationType.LogarithmicNormalization]: LOGARITHMIC,
	[NormalisationType.MinMax]: MIN_MAX,
	[NormalisationType.RobustScaling]: ROBUST_SCALING,
	[NormalisationType.ZScore]: Z_SCORE,
	[NormalisationType.None]: NONE_NORMALIZER,
	[NormalisationType.Border]: BORDER,
};
