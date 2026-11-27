import type { FeatureVector } from "../feature-vector";

/** What the event detectors read of a bar. */
interface MarketStep {
	price: number;
	features: FeatureVector;
	/** Open time of the bar, in ms: anchors the `frameSkip` cadence. */
	timestamp?: number;
}

/** The decision gene of a genome (ADR-0076 §5). */
interface DecisionGenome {
	mode: "every_bar" | "on_event";
	priceMove: number;
	volumeMultiple: number;
	minGap: number;
}

/** When the genome decides: every `frameSkip` bars, or on events. */
export interface HorizonGenome {
	frameSkip: number;
	decision?: DecisionGenome;
}

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
 * last EVENT_WINDOW bars, or the volume / its standard deviation (`volumeRatio`) reached `volumeMultiple`.
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
 * Absolute bar number of each step: its open time over the bar interval (the
 * smallest gap between two steps). Steps without timestamps, or fewer than
 * two, fall back to their index.
 */
function barNumbers(steps: readonly MarketStep[]): number[] {
	const times = steps.map((step) => step.timestamp ?? Number.NaN);
	let interval = Number.POSITIVE_INFINITY;
	for (let index = 1; index < times.length; index++) {
		const gap = times[index] - times[index - 1];
		interval = gap > 0 ? Math.min(interval, gap) : interval;
	}
	return Number.isFinite(interval) && !times.some(Number.isNaN)
		? times.map((time) => Math.round(time / interval))
		: steps.map((_, index) => index);
}

/**
 * Bars the agent decides on, in order: the bars whose absolute bar number
 * (open time / interval) is a multiple of `frameSkip`, so training, replay
 * and a live sliding window decide on the same bars whatever their first
 * bar; or in `on_event` mode the bars where a detector fires, at least
 * `minGap` bars after the previous decision.
 */
export function decisionBars(
	steps: readonly MarketStep[],
	horizon: HorizonGenome
): number[] {
	const bars: number[] = [];
	const gene = horizon.decision;
	if (!(gene && isEventDriven(horizon))) {
		for (const [index, bar] of barNumbers(steps).entries()) {
			if (bar % horizon.frameSkip === 0) {
				bars.push(index);
			}
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

/** `barsSince` as the network input, in [-1, 1]; undefined stays undefined (every-bar genomes). */
export function barsSinceInput(barsSince?: number): number | undefined {
	return barsSince === undefined
		? undefined
		: (2 * barsSince) / MAX_BARS_SINCE_DECISION - 1;
}

/**
 * One episode over all the bars: the agent plays on its decision bars, and
 * every bar adds its PnL change to `pnlCurve` (0 on a bar it skips: the move
 * lands on the next decision). Shared by the trainer's evaluation and the
 * replay of a published model (ADR-0079 §3).
 */
export function playEpisode<Step extends MarketStep>(
	steps: readonly Step[],
	horizon: HorizonGenome,
	agent: {
		step(step: Step, barsSince?: number): void;
		/** PnL of the wallet, marked to `mark`'s price when given. */
		pnl(mark?: Step): number;
	},
	pnlCurve: number[]
): { pnl: number; decisions: number } {
	const eventDriven = isEventDriven(horizon);
	const bars = decisionBars(steps, horizon);
	let rank = 0;
	const startPnl = agent.pnl();
	let lastPnl = startPnl;
	for (let index = 0; index < steps.length; index++) {
		if (bars[rank] !== index) {
			// The last bar marks the wallet to its close even without a decision.
			const pnl =
				index === steps.length - 1 ? agent.pnl(steps[index]) : lastPnl;
			pnlCurve.push(pnl - lastPnl);
			lastPnl = pnl;
			continue;
		}
		agent.step(
			steps[index],
			eventDriven ? barsSinceDecision(bars, rank) : undefined
		);
		rank++;
		const pnl = agent.pnl();
		pnlCurve.push(pnl - lastPnl);
		lastPnl = pnl;
	}
	return { pnl: lastPnl - startPnl, decisions: bars.length };
}
