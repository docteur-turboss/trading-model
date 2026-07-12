import { DurationMs } from "@trading-model/common/domain/primitives";
import { EpisodeScores } from "../../src/core/genetic-algorithm/episode-scores";
import { createDefaultGenome } from "../../src/core/genetic-algorithm/factory";
import type {
	GenomeFitnessMeta,
	LamarckGenome,
} from "../../src/core/genetic-algorithm/genome-types";
import type { DeepReadonly } from "../../src/core/genetic-algorithm/shared-types";

export function makeMinimalBestGenome(): DeepReadonly<LamarckGenome> {
	return createDefaultGenome("test-best", 5) as DeepReadonly<LamarckGenome>;
}

export function makeMinimalFitnessMeta(): GenomeFitnessMeta {
	return {
		episodesRun: 10,
		computeMs: DurationMs.of(5000),
		efficiencyScore: 1.5,
		variance: 0.1,
		rawScores: new EpisodeScores([1.0, 1.2, 1.4, 1.6, 1.8]),
	};
}

export function makeBestGenomeNoMeta(): DeepReadonly<LamarckGenome> {
	return createDefaultGenome("test-no-meta", 3) as DeepReadonly<LamarckGenome>;
}
