import {
	type Fitness,
	SharpeRatio,
} from "@trading-model/primitives/primitives";
import { EpisodeScores } from "./genetic-algorithm/episode-scores";
import type { GenomeFitnessMeta } from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { BestAgentSummary } from "./training-state";

function buildGASummary(
	genome: DeepReadonly<LamarckGenome>
): BestAgentSummary["gaControl"] {
	return {
		populationSize: genome.gaControl.population.size,
		elitismFraction: genome.gaControl.population.elitismFraction,
		survivorFraction: genome.gaControl.population.survivorFraction,
		episodesPerIndividual: genome.gaControl.evaluation.episodesPerIndividual,
		selectionType: genome.gaControl.selectionType,
		fitnessType: genome.gaControl.fitnessType,
	};
}

function buildNetworkSummary(
	genome: DeepReadonly<LamarckGenome>
): BestAgentSummary["network"] {
	return {
		inputDim: genome.network.inputDim,
		outputDim: genome.network.outputDim,
		hiddenLayers: genome.network.hiddenLayers.map((layer) => ({
			neurons: layer.neurons,
			activation: layer.activation,
		})),
	};
}

function buildRLSummary(
	genome: DeepReadonly<LamarckGenome>
): BestAgentSummary["rl"] {
	return {
		gamma: genome.rl.gamma,
		learningRate: genome.rl.learningRate,
		epsilonStart: genome.rl.discretePolicy.epsilonStart,
		epsilonMin: genome.rl.discretePolicy.epsilonMin,
		epsilonDecay: genome.rl.discretePolicy.epsilonDecay,
	};
}

/**
 * Sharpe of the bar curve times sqrt(bars per year), comparable across
 * timeframes; per bar when the data carried no timestamps.
 */
function annualisedSharpe(
	curve: EpisodeScores,
	fitnessMeta: GenomeFitnessMeta | undefined
): number {
	const perYear = fitnessMeta?.pnlCurve ? fitnessMeta.barsPerYear : undefined;
	return curve.sharpe() * Math.sqrt(perYear ?? 1);
}

export function buildSummary(
	genome: DeepReadonly<LamarckGenome>,
	fitness: Fitness,
	fitnessMeta?: GenomeFitnessMeta
): BestAgentSummary {
	// Bar-by-bar PnL when the evaluation recorded it, else the episode PnLs.
	const curve = fitnessMeta?.pnlCurve ?? fitnessMeta?.rawScores;
	return {
		id: String(genome.id),
		generation: genome.generation,
		fitness,
		sharpe: SharpeRatio.of(curve ? annualisedSharpe(curve, fitnessMeta) : 0),
		avgPnl: fitnessMeta?.rawScores ? fitnessMeta.rawScores.mean() : 0,
		maxDrawdown: curve ? curve.maxDrawdown() : 0,
		gaControl: buildGASummary(genome),
		network: buildNetworkSummary(genome),
		rl: buildRLSummary(genome),
	};
}

export function computeSharpe(scores: readonly number[]): number {
	return new EpisodeScores([...scores]).sharpe();
}
