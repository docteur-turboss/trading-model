import { sampleGaussian } from "@trading-model/model-runtime/noise";
import { PositiveInt } from "@trading-model/primitives/primitives";
import { clamp } from "../utils";
import type { DecisionGenome } from "./types";

/** Fixed bounds: crossover stays homologous whatever the parents. */
const BOUNDS = {
	priceMove: [0.001, 0.05],
	volumeMultiple: [1, 10],
	minGap: [1, 50],
} as const;

/** Default `on_event` genes of a new genome. */
export function createDecisionGenome(): DecisionGenome {
	return {
		mode: "on_event",
		priceMove: 0.01,
		volumeMultiple: 3,
		minGap: PositiveInt.of(3),
	};
}

function bounded(gene: DecisionGenome): DecisionGenome {
	return {
		mode: gene.mode,
		priceMove: clamp(gene.priceMove, ...BOUNDS.priceMove),
		volumeMultiple: clamp(gene.volumeMultiple, ...BOUNDS.volumeMultiple),
		minGap: Math.round(clamp(gene.minGap, ...BOUNDS.minGap)) as PositiveInt,
	};
}

export function crossoverDecision(
	left: DecisionGenome,
	right: DecisionGenome,
	crossoverFn: (valueA: number, valueB: number) => number
): DecisionGenome {
	return bounded({
		mode: left.mode,
		priceMove: crossoverFn(left.priceMove, right.priceMove),
		volumeMultiple: crossoverFn(left.volumeMultiple, right.volumeMultiple),
		minGap: crossoverFn(left.minGap, right.minGap) as PositiveInt,
	});
}

export function mutateDecision(
	gene: DecisionGenome,
	rng: () => number
): DecisionGenome {
	return bounded({
		mode: gene.mode,
		priceMove: gene.priceMove * Math.exp(sampleGaussian(rng, 0.2)),
		volumeMultiple: gene.volumeMultiple + sampleGaussian(rng, 0.3),
		minGap: (gene.minGap + Math.round(sampleGaussian(rng, 1))) as PositiveInt,
	});
}
