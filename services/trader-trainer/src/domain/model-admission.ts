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

/** Fewest days of bars the test segment must cover, whatever the bar interval (ADR-0069). */
export const MIN_ADMISSION_TEST_DAYS = 30;

/**
 * Sharpe bar raised for the `attempt`-th try on the same test segment
 * (selection bias, ADR-0030): the expected best of N noise Sharpes,
 * `sqrt(2 ln N)` standard errors, one of them being `sqrt(barsPerYear / bars)`
 * once annualised. Zero on the first try.
 */
export function attemptSharpePenalty(
	attempt: number,
	bars: number,
	barsPerYear: number
): number {
	return (
		Math.sqrt(2 * Math.log(Math.max(attempt, 1))) *
		Math.sqrt(barsPerYear / bars)
	);
}

/** Verdict written in the manifest; `admissible` only makes a model eligible. */
export interface ModelAdmission {
	admissible: boolean;
	evaluatedOn: "test";
	/** Annualised ratios of the model and Sharpe of buy and hold on the same bars. */
	criteria: SegmentRatios;
	/** `minSharpe` is the effective one: base + `attemptSharpePenalty`. */
	thresholds: Record<keyof typeof ADMISSION_THRESHOLDS, number>;
	/** Rank of this verdict among the symbol's published models (1 = first); absent in older manifests. */
	attempt?: number;
}

/**
 * Checks the ADR-0030 criteria on the test segment metrics of the published
 * genome. Undefined unless they were measured on the test segment: metrics of
 * the validation the selection read are biased upward (ADR-0068), and
 * undefined under `MIN_ADMISSION_TEST_BARS` test bars (or `barsPerYear` if fewer)
 * and under `MIN_ADMISSION_TEST_DAYS` days of bars. Without bar
 * timestamps (`barsPerYear` unknown) the ratios stay per bar. The Sharpe bar rises with `attempt`
 * (`attemptSharpePenalty`). A model that
 * never decided (`decisions` 0) is never admissible.
 */
export function assessAdmission(
	meta: GenomeFitnessMeta | undefined,
	test: readonly MarketStep[],
	attempt?: number
): ModelAdmission | undefined {
	const curve = meta?.pnlCurve;
	if (
		meta?.evaluatedOn !== "test" ||
		!curve ||
		test.length <
			Math.max(
				Math.min(
					MIN_ADMISSION_TEST_BARS,
					meta.barsPerYear ?? MIN_ADMISSION_TEST_BARS
				),
				Math.ceil((MIN_ADMISSION_TEST_DAYS * (meta.barsPerYear ?? 0)) / 365)
			)
	) {
		return undefined;
	}
	const barsPerYear = meta.barsPerYear ?? 1;
	const criteria = segmentRatios(curve, barsPerYear, test);
	const minSharpe =
		ADMISSION_THRESHOLDS.minSharpe +
		attemptSharpePenalty(attempt ?? 1, test.length, barsPerYear);
	return {
		admissible:
			meta.decisions !== 0 &&
			criteria.sharpe >= minSharpe &&
			criteria.sortino >= ADMISSION_THRESHOLDS.minSortino &&
			criteria.calmar >= ADMISSION_THRESHOLDS.minCalmar &&
			criteria.sharpe > criteria.buyAndHoldSharpe,
		evaluatedOn: "test",
		criteria,
		thresholds: { ...ADMISSION_THRESHOLDS, minSharpe },
		...(attempt !== undefined && { attempt }),
	};
}
