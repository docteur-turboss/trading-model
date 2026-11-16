import type { MarketStep } from "./genome-fitness";
import type { DecisionGenome, HorizonGenome } from "./genome-rl/types";

/** Bars the price-move detector looks back over. */
const EVENT_WINDOW = 5;

/** Network input shown for a gap this long or longer (and for the first decision). */
export const MAX_BARS_SINCE_DECISION = 50;

/** Whether the genome decides on market events instead of on a fixed cadence. */
export function isEventDriven(horizon: HorizonGenome): boolean {
	return horizon.decision?.mode === "on_event";
}

/**
 * Detectors on bar `index`, from the bars closed up to and including it (the
 * decision is taken on its close): the close moved by `priceMove` over the
 * last EVENT_WINDOW bars, or the volume reached `volumeMultiple` deviations.
 * No order-book detector: candles carry no book imbalance (ADR-0078).
 */
function fires(
	steps: readonly MarketStep[],
	index: number,
	gene: DecisionGenome
): boolean {
	const move =
		index >= EVENT_WINDOW
			? Math.abs(
					Number(steps[index].price) /
						Number(steps[index - EVENT_WINDOW].price) -
						1
				)
			: 0;
	return (
		move >= gene.priceMove ||
		Number(steps[index].features.candle.volumeRatio) >= gene.volumeMultiple
	);
}

/**
 * Bars the agent decides on, in order: every `frameSkip` bars, or in
 * `on_event` mode the bars where a detector fires, at least `minGap` bars
 * after the previous decision.
 */
export function decisionBars(
	steps: readonly MarketStep[],
	horizon: HorizonGenome
): number[] {
	const bars: number[] = [];
	const gene = horizon.decision;
	if (!(gene && isEventDriven(horizon))) {
		for (let index = 0; index < steps.length; index += horizon.frameSkip) {
			bars.push(index);
		}
		return bars;
	}
	let last = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < steps.length; index++) {
		if (index - last >= gene.minGap && fires(steps, index, gene)) {
			bars.push(index);
			last = index;
		}
	}
	return bars;
}

/** Bars since the previous decision, the first one counting as a long gap. */
export function barsSinceDecision(
	bars: readonly number[],
	rank: number
): number {
	return rank === 0
		? MAX_BARS_SINCE_DECISION
		: Math.min(bars[rank] - bars[rank - 1], MAX_BARS_SINCE_DECISION);
}
