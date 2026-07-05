import type { ActivationType } from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { BestAgentSummary } from "./trainer";

export class GenomeSummaryBuilder {
	buildGASummary(
		genome: DeepReadonly<LamarckGenome>
	): BestAgentSummary["gaControl"] {
		return {
			populationSize: genome.gaControl.populationSize,
			elitismFraction: genome.gaControl.elitismFraction,
			survivorFraction: genome.gaControl.survivorFraction,
			episodesPerIndividual: genome.gaControl.episodesPerIndividual,
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
			hiddenLayers: genome.network.hiddenLayers.map(
				(layer: { neurons: number; activation: ActivationType }) => ({
					neurons: layer.neurons,
					activation: layer.activation,
				})
			),
		};
	}

	buildRLSummary(
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

	buildBestAgentSummary(
		genome: DeepReadonly<LamarckGenome>
	): BestAgentSummary {
		const meta = genome.fitnessMeta;
		return {
			id: genome.id,
			generation: genome.generation,
			fitness: genome.fitness ?? 0,
			sharpe: meta?.rawScores
				? GenomeSummaryBuilder.computeSharpe(meta.rawScores)
				: 0,
			avgPnl: meta?.rawScores
				? GenomeSummaryBuilder.computeAvgPnl(meta.rawScores)
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

	static computeSharpe(scores: readonly number[]): number {
		if (scores.length < 2) {
			return 0;
		}
		const mean =
			scores.reduce((sum, val) => sum + val, 0) / scores.length;
		const variance =
			scores
				.map((val) => (val - mean) ** 2)
				.reduce((sum, val) => sum + val, 0) /
			(scores.length - 1);
		const std = Math.sqrt(variance);
		return std < 1e-10 ? mean : mean / std;
	}
}
