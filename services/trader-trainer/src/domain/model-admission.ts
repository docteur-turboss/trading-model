import {
	type SegmentRatios,
	segmentRatios,
} from "@trading-model/model-runtime/replay-metrics";
import type { GenomeFitnessMeta, MarketStep } from "./genetic-algorithm/genome";

/**
 * ADR-0030 thresholds one test segment can be held to (ADR-0069); the
 * t-statistic and the stability need several segments and seeds (MT4 only).
 */
export const ADMISSION_THRESHOLDS = {
	minSharpe: 1.0,
	minSortino: 1.5,
	/** Annualised return / max drawdown. */
	minCalmar: 1.0,
} as const;

/**
 * Fewest test bars a verdict needs: one day of one-minute bars, or a year of
 * bars when that is fewer (daily bars: about 252). Below it the annualised
 * ratios (x sqrt(barsPerYear), x barsPerYear) mean nothing (ADR-0069).
 */
export const MIN_ADMISSION_TEST_BARS = 1440;

/** Verdict written in the manifest; `admissible` only makes a model eligible. */
export interface ModelAdmission {
	admissible: boolean;
	evaluatedOn: "test";
	/** Annualised ratios of the model and Sharpe of buy and hold on the same bars. */
	criteria: SegmentRatios;
	thresholds: typeof ADMISSION_THRESHOLDS;
}

/**
 * Checks the ADR-0030 criteria on the test segment metrics of the published
 * genome. Undefined unless they were measured on the test segment: metrics of
 * the validation the selection read are biased upward (ADR-0068), and
 * undefined under `MIN_ADMISSION_TEST_BARS` test bars (or `barsPerYear` if fewer). Without bar
 * timestamps (`barsPerYear` unknown) the ratios stay per bar. A model that
 * never decided (`decisions` 0) is never admissible.
 */
export function assessAdmission(
	meta: GenomeFitnessMeta | undefined,
	test: readonly MarketStep[]
): ModelAdmission | undefined {
	const curve = meta?.pnlCurve;
	if (
		meta?.evaluatedOn !== "test" ||
		!curve ||
		test.length <
			Math.min(
				MIN_ADMISSION_TEST_BARS,
				meta.barsPerYear ?? MIN_ADMISSION_TEST_BARS
			)
	) {
		return undefined;
	}
	const criteria = segmentRatios(curve, meta.barsPerYear ?? 1, test);
	return {
		admissible:
			meta.decisions !== 0 &&
			criteria.sharpe >= ADMISSION_THRESHOLDS.minSharpe &&
			criteria.sortino >= ADMISSION_THRESHOLDS.minSortino &&
			criteria.calmar >= ADMISSION_THRESHOLDS.minCalmar &&
			criteria.sharpe > criteria.buyAndHoldSharpe,
		evaluatedOn: "test",
		criteria,
		thresholds: ADMISSION_THRESHOLDS,
	};
}
