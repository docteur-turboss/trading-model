import type {
	ModelManifest,
	ModelSummary,
	NewModelArtifact,
} from "../model-artifact";

/** Where trained agents are kept (ADR-0022). */
export interface ModelArtifactStorePort {
	/** Writes a new immutable version and applies the retention. */
	save(artifact: NewModelArtifact): Promise<ModelSummary>;
	/** Versions of a symbol, newest first. */
	list(symbol: string): Promise<ModelSummary[]>;
	manifest(symbol: string, version: string): Promise<ModelManifest | undefined>;
	/** Raw float32 little-endian weights. */
	weights(symbol: string, version: string): Promise<Uint8Array | undefined>;
}
