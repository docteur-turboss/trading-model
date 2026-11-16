import { EpisodeScores } from "./episode-scores";

/** The two fields of a bar the replay metrics read. */
interface TimedPriceStep {
	price: number | string;
	timestamp?: number;
}

const MS_PER_YEAR = 365.25 * 24 * 3_600_000;

/**
 * Bars per year of the evaluated market data, from the median spacing of the
 * validation timestamps; undefined without at least two timestamped bars.
 */
export function barsPerYear(
	steps: readonly TimedPriceStep[]
): number | undefined {
	const gaps: number[] = [];
	for (let idx = 1; idx < steps.length; idx++) {
		const prev = steps[idx - 1].timestamp;
		const curr = steps[idx].timestamp;
		if (prev !== undefined && curr !== undefined && curr > prev) {
			gaps.push(curr - prev);
		}
	}
	if (gaps.length === 0) {
		return;
	}
	gaps.sort((left, right) => left - right);
	return MS_PER_YEAR / gaps[Math.floor(gaps.length / 2)];
}

/**
 * Annualised Sharpe of holding one unit over the bars of every segment: the
 * baseline of the published agent Sharpe, on the same bars and annualised the
 * same way.
 */
export function buyAndHoldSharpe(
	segments: readonly (readonly TimedPriceStep[])[]
): number {
	const curve = segments.flatMap((steps) =>
		steps
			.slice(1)
			.map((step, idx) => Number(step.price) - Number(steps[idx].price))
	);
	const perYear = barsPerYear(segments.flat());
	return new EpisodeScores(curve).sharpe() * Math.sqrt(perYear ?? 1);
}
