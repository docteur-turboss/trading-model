/** Training hyper-parameters, resolved from the environment by the composition root. */
export interface TrainingSettings {
	/** Fraction of each window kept for validation (0..1). */
	validationSplit: number;
	walkForwardFolds: number;
	generations: number;
	populationSize: number;
	timeBudgetMs: number;
	episodesPerIndividual: number;
}
