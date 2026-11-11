import { DEFAULT_MAX_EXPOSURE_FRACTION } from "./env/wallet-config";
import type { LamarckGenome } from "./genetic-algorithm/genome-fitness";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { BestAgentSummary } from "./training-state";

/**
 * A trained agent kept as an immutable, versioned artifact (ADR-0022): the
 * manifest holds everything needed to rebuild and run the agent, the weights
 * file holds its trained weights.
 */
export const MODEL_FORMAT_VERSION = 1;
export const WEIGHTS_FILE = "weights.f32";
export const MANIFEST_FILE = "manifest.json";

/** `<UTC yyyymmddThhmmssZ>-<first 12 hex of the weights sha256>`. */
export const MODEL_VERSION_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;
/** Symbols are path segments: letters, digits, `.`, `_` and `-` only. */
export const MODEL_SYMBOL_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * How the metrics were computed (ADR-0025). 2: wallet PnL, annualised Sharpe of
 * the bar curve, evaluation at a fixed epsilon. Absent on older manifests,
 * whose metrics came from the shaped reward: never compare the two. 4: the
 * simulator caps the position value at `riskLimits.maxExposureFraction`.
 */
const MODEL_METRICS_VERSION = 4;

export interface ModelMetrics {
	metricsVersion?: number;
	generation: number;
	fitness: number;
	sharpe: number;
	avgPnl: number;
	maxDrawdown: number;
}

export interface ModelManifest {
	formatVersion: typeof MODEL_FORMAT_VERSION;
	symbol: string;
	version: string;
	/** ISO 8601. */
	createdAt: string;
	producedBy: { instanceId: string };
	weights: {
		file: typeof WEIGHTS_FILE;
		dtype: "float32-le";
		length: number;
		sha256: string;
	};
	/** The best genome without its weights: topology, RL and GA genes. */
	genome: Record<string, unknown>;
	/** Layout of the input vector: `fields[i]` is the meaning of input `i`. */
	features: { dim: number; fields: string[] };
	/** Normalization statistics of the symbol at the end of training. */
	normalization: Record<string, unknown>;
	metrics: ModelMetrics;
	/** Constraint the policy learned under (absent on older manifests: unbounded). */
	riskLimits?: { maxExposureFraction: number };
}

/** What lists and API responses tell about a version, without the manifest body. */
export interface ModelSummary {
	symbol: string;
	version: string;
	createdAt: string;
	sha256: string;
	metrics: ModelMetrics;
}

/** A trained agent to store; the store adds the hash and the version. */
export interface NewModelArtifact {
	symbol: string;
	instanceId: string;
	bestGenome: DeepReadonly<LamarckGenome>;
	weights: Float32Array;
	features: { dim: number; fields: string[] };
	normalization: Record<string, unknown>;
	summary: BestAgentSummary;
}

export function modelVersion(createdAt: Date, sha256: string): string {
	const stamp = createdAt
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z")
		.replace(/[-:]/g, "");
	return `${stamp}-${sha256.slice(0, 12)}`;
}

export function buildModelManifest(
	artifact: NewModelArtifact,
	stored: { version: string; createdAt: Date; sha256: string }
): ModelManifest {
	const { trainedWeights: _weights, ...genome } = artifact.bestGenome;
	const { summary } = artifact;
	return {
		formatVersion: MODEL_FORMAT_VERSION,
		symbol: artifact.symbol,
		version: stored.version,
		createdAt: stored.createdAt.toISOString(),
		producedBy: { instanceId: artifact.instanceId },
		weights: {
			file: WEIGHTS_FILE,
			dtype: "float32-le",
			length: artifact.weights.length,
			sha256: stored.sha256,
		},
		genome: JSON.parse(JSON.stringify(genome)),
		features: artifact.features,
		normalization: artifact.normalization,
		riskLimits: { maxExposureFraction: DEFAULT_MAX_EXPOSURE_FRACTION },
		metrics: {
			metricsVersion: MODEL_METRICS_VERSION,
			generation: summary.generation,
			fitness: summary.fitness,
			sharpe: summary.sharpe,
			avgPnl: summary.avgPnl,
			maxDrawdown: summary.maxDrawdown,
		},
	};
}

export function summarizeModel(manifest: ModelManifest): ModelSummary {
	return {
		symbol: manifest.symbol,
		version: manifest.version,
		createdAt: manifest.createdAt,
		sha256: manifest.weights.sha256,
		metrics: manifest.metrics,
	};
}
