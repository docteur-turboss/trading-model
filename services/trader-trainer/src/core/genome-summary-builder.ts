import {
	type Fitness,
	SharpeRatio,
} from "@trading-model/common/domain/primitives";
import { EpisodeScores } from "./genetic-algorithm/episode-scores";
import type { GenomeFitnessMeta } from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { BestAgentSummary } from "./trainer";

export function buildGASummary(
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

export function buildNetworkSummary(
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

export function buildRLSummary(
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

export function buildSummary(
	genome: DeepReadonly<LamarckGenome>,
	fitness: Fitness,
	fitnessMeta?: GenomeFitnessMeta
): BestAgentSummary {
	return {
		id: String(genome.id),
		generation: genome.generation,
		fitness,
		sharpe: SharpeRatio.of(
			fitnessMeta?.rawScores ? fitnessMeta.rawScores.sharpe() : 0
		),
		avgPnl: fitnessMeta?.rawScores ? fitnessMeta.rawScores.mean() : 0,
		negFlops: 0,
		complexityPenalty: 0,
		gaControl: buildGASummary(genome),
		network: buildNetworkSummary(genome),
		rl: buildRLSummary(genome),
	};
}

export function computeAvgPnl(rawScores: readonly number[]): number {
	return new EpisodeScores([...rawScores]).mean();
}

export function computeSharpe(scores: readonly number[]): number {
	return new EpisodeScores([...scores]).sharpe();
}
