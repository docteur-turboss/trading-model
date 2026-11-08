/**
 * Observability hooks of the GA engine.
 *
 * Keeps the engine free of metrics libraries: the composition root binds these
 * hooks to Prometheus (config/container.ts); the default is a no-op.
 */
export interface GaTelemetry {
	generationStarted(generation: number, populationSize: number): void;
	stagnationUpdated(stagnation: number): void;
	evaluationFailed(reason: string): void;
	/** One genome evaluated on every window: it blocks the event loop that long. */
	genomeEvaluated(durationMs: number): void;
	/** Crossovers of one generation that copied a parent because the weight lengths differ. */
	crossoverFallbacks(count: number): void;
}

export const NoopGaTelemetry: GaTelemetry = {
	generationStarted: () => {
		// Intentional no-op.
	},
	stagnationUpdated: () => {
		// Intentional no-op.
	},
	evaluationFailed: () => {
		// Intentional no-op.
	},
	genomeEvaluated: () => {
		// Intentional no-op.
	},
	crossoverFallbacks: () => {
		// Intentional no-op.
	},
};
