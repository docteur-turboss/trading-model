import { buyAndHoldSharpe } from "./genetic-algorithm/evaluation-utils";
import type { GenomeFitnessMeta, MarketStep } from "./genetic-algorithm/genome";
import { annualisedSharpe } from "./genome-summary-builder";

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

/** Verdict written in the manifest; `admissible` only makes a model eligible. */
export interface ModelAdmission {
	admissible: boolean;
	evaluatedOn: "test";
	/** Annualised ratios of the model and Sharpe of buy and hold on the same bars. */
	criteria: {
		sharpe: number;
		sortino: number;
		calmar: number;
		buyAndHoldSharpe: number;
	};
	thresholds: typeof ADMISSION_THRESHOLDS;
}

/**
 * Checks the ADR-0030 criteria on the test segment metrics of the published
 * genome. Undefined unless they were measured on the test segment: metrics of
 * the validation the selection read are biased upward (ADR-0068). Without bar
 * timestamps (`barsPerYear` unknown) the ratios stay per bar.
 */
export function assessAdmission(
	meta: GenomeFitnessMeta | undefined,
	test: readonly MarketStep[]
): ModelAdmission | undefined {
	const curve = meta?.pnlCurve;
	if (meta?.evaluatedOn !== "test" || !curve) {
		return undefined;
	}
	const perYear = meta.barsPerYear ?? 1;
	const criteria = {
		sharpe: annualisedSharpe(curve, meta),
		sortino: curve.sortino() * Math.sqrt(perYear),
		calmar: curve.calmar() * perYear,
		buyAndHoldSharpe: buyAndHoldSharpe([test]),
	};
	return {
		admissible:
			criteria.sharpe >= ADMISSION_THRESHOLDS.minSharpe &&
			criteria.sortino >= ADMISSION_THRESHOLDS.minSortino &&
			criteria.calmar >= ADMISSION_THRESHOLDS.minCalmar &&
			criteria.sharpe > criteria.buyAndHoldSharpe,
		evaluatedOn: "test",
		criteria,
		thresholds: ADMISSION_THRESHOLDS,
	};
}
