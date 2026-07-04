import { createDefaultGenome } from "../../src/core/genetic-algorithm/factory";
import type { LamarckGenome } from "../../src/core/genetic-algorithm/genome-types";
import type { DeepReadonly } from "../../src/core/genetic-algorithm/shared-types";

export function makeMinimalBestGenome(): DeepReadonly<LamarckGenome> {
	const g = createDefaultGenome("test-best", 5) as LamarckGenome;
	(g as LamarckGenome).fitness = 1.5;
	(g as LamarckGenome).fitnessMeta = {
		episodesRun: 10,
		computeMs: 5000,
		efficiencyScore: 1.5,
		variance: 0.1,
		rawScores: [1.0, 1.2, 1.4, 1.6, 1.8],
	};
	return g as DeepReadonly<LamarckGenome>;
}

export function makeBestGenomeNoMeta(): DeepReadonly<LamarckGenome> {
	const g = createDefaultGenome("test-no-meta", 3) as LamarckGenome;
	(g as LamarckGenome).fitness = 0.5;
	return g as DeepReadonly<LamarckGenome>;
}
