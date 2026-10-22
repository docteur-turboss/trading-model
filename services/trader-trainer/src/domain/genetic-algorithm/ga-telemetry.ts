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
}

export const NoopGaTelemetry: GaTelemetry = {
	generationStarted: () => {},
	stagnationUpdated: () => {},
	evaluationFailed: () => {},
};
