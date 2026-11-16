/**
 * Observability hooks of the GA engine.
 *
 * Keeps the engine free of metrics libraries: the composition root binds these
 * hooks to Prometheus (config/container.ts); the default is a no-op.
 */
export interface GaTelemetry {
	generationStarted(generation: number): void;
	stagnationUpdated(stagnation: number): void;
	evaluationFailed(reason: string): void;
	/** One genome evaluated on every window: it blocks the event loop that long. */
	genomeEvaluated(durationMs: number): void;
	/** Crossovers of one generation that copied a parent because the weight lengths differ. */
	crossoverFallbacks(count: number): void;
	/** Input masks of the generation's population, in the order of the `groups` names. */
	inputMasks?(
		groups: readonly string[],
		masks: readonly (readonly boolean[])[]
	): void;
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
