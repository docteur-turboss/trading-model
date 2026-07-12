import {
	type Fitness,
	SharpeRatio,
} from "@trading-model/common/domain/primitives";
import type { GenomeFitnessMeta } from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { BestAgentSummary } from "./trainer";

export class GenomeSummaryBuilder {
	buildGASummary(
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

	buildNetworkSummary(
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

	buildRLSummary(genome: DeepReadonly<LamarckGenome>): BestAgentSummary["rl"] {
		return {
			gamma: genome.rl.gamma,
			learningRate: genome.rl.learningRate,
			epsilonStart: genome.rl.discretePolicy.epsilonStart,
			epsilonMin: genome.rl.discretePolicy.epsilonMin,
			epsilonDecay: genome.rl.discretePolicy.epsilonDecay,
		};
	}

	build(
		genome: DeepReadonly<LamarckGenome>,
		fitness: Fitness,
		fitnessMeta?: GenomeFitnessMeta
	): BestAgentSummary {
		return {
			id: String(genome.id),
			generation: genome.generation,
			fitness,
			sharpe: SharpeRatio.of(
				fitnessMeta?.rawScores
					? GenomeSummaryBuilder.computeSharpe(fitnessMeta.rawScores.values)
					: 0
			),
			avgPnl: fitnessMeta?.rawScores
				? GenomeSummaryBuilder.computeAvgPnl(fitnessMeta.rawScores.values)
				: 0,
			negFlops: 0,
			complexityPenalty: 0,
			gaControl: this.buildGASummary(genome),
			network: this.buildNetworkSummary(genome),
			rl: this.buildRLSummary(genome),
		};
	}

	static computeAvgPnl(rawScores: readonly number[]): number {
		return (
			([...rawScores] as number[]).reduce(
				(sum: number, val: number) => sum + val,
				0
			) / rawScores.length
		);
	}

	static computeVariance(scores: readonly number[], mean: number): number {
		return (
			scores
				.map((val) => (val - mean) ** 2)
				.reduce((sum, val) => sum + val, 0) /
			(scores.length - 1)
		);
	}

	static computeSharpe(scores: readonly number[]): number {
		if (scores.length < 2) {
			return 0;
		}
		const mean = GenomeSummaryBuilder.computeAvgPnl(scores);
		const variance = GenomeSummaryBuilder.computeVariance(scores, mean);
		const std = Math.sqrt(variance);
		return std < 1e-10 ? mean : mean / std;
	}
}
