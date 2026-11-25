import { actionLabels } from "@trading-model/model-runtime/agent/action-mapper";
import { DEFAULT_MAX_EXPOSURE_FRACTION } from "@trading-model/model-runtime/env/wallet-config";
import { WEIGHTS_FILE } from "@trading-model/model-runtime/model-artifact-reader";
import type { ManifestGenome } from "@trading-model/model-runtime/model-manifest";
import { EVAL_EPSILON } from "./genetic-algorithm/evaluation-phase";
import type { LamarckGenome } from "./genetic-algorithm/genome-fitness";
import { SIMULATOR_PARAMS } from "./genetic-algorithm/rl-backend";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { ModelAdmission } from "./model-admission";
import type { BestAgentSummary } from "./training-state";

/**
 * A trained agent kept as an immutable, versioned artifact (ADR-0022): the
 * manifest holds everything needed to rebuild and run the agent, the weights
 * file holds its trained weights.
 */
const MODEL_FORMAT_VERSION = 1;
/** The trainer reads one-minute candles from the scraper. */
const CANDLE_INTERVAL_MS = 60_000;

/**
 * How the metrics were computed (ADR-0025). 2: wallet PnL, annualised Sharpe of
 * the bar curve, evaluation at a fixed epsilon. Absent on older manifests,
 * whose metrics came from the shaped reward: never compare the two. 4: fills
 * at the next bar's open with half-spread + slippage (ADR-0066): not comparable
 * with 3. 5: the simulator caps the position value at
 * `riskLimits.maxExposureFraction`.
 * 6: sharpe, avgPnl and maxDrawdown measured on the test segment
 * (`evaluatedOn`), not on the data the selection used (ADR-0068).
 * 7: a buy is reduced to the cap at the fill price instead of refused.
 */
const MODEL_METRICS_VERSION = 7;

interface ModelMetrics {
	metricsVersion?: number;
	generation: number;
	fitness: number;
	sharpe: number;
	avgPnl: number;
	maxDrawdown: number;
	/** Segment sharpe, avgPnl and maxDrawdown come from; absent: validation. */
	evaluatedOn?: "validation" | "test";
}

/** Candle window a model was trained on, epoch ms. */
export interface ModelReplayWindow {
	/** Open time of the first candle: features are normalised from it. */
	from: number;
	/** Timestamp of the first step of the test segment (the newest steps). */
	testFrom: number;
	/** Close time of the last candle: nothing later was used. */
	to: number;
	/** Bar length when it is not one minute, and the costs of a daily asset (ADR-0083). */
	intervalMs?: number;
	simulator?: SimulatorParams;
}

/**
 * What a consumer needs to replay the model on stored candles (ADR-0079): the
 * window and the simulator its metrics were measured with.
 */
interface ModelReplay extends ModelReplayWindow {
	intervalMs: number;
	/** Exploration of the trainer's evaluation episodes; a replay plays greedy (0). */
	evalEpsilon: number;
	simulator: SimulatorParams;
}

type SimulatorParams = {
	[Key in keyof typeof SIMULATOR_PARAMS]: number | boolean;
};

/** A shared part of a model (ADR-0076 §7), immutable once published: content-addressed, `version` is the prefix of `sha256`. */
export interface ModelComponent {
	role: "trunk";
	id: string;
	version: string;
	sha256: string;
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
	genome: ManifestGenome;
	/** Layout of the input vector: `fields[i]` is the meaning of input `i`. */
	features: { dim: number; fields: string[] };
	/** Normalization statistics of the symbol at the end of training. */
	normalization: Record<string, unknown>;
	metrics: ModelMetrics;
	/** Constraint the policy learned under (absent on older manifests: unbounded). */
	riskLimits?: { maxExposureFraction: number };
	/** Ordered actions: network output `i` is `actions[i]`; absent: sell, hold, buy (ADR-0076). */
	actions?: string[];
	/** ADR-0030 verdict on the test segment (ADR-0069); absent: not admissible. */
	admission?: ModelAdmission;
	/** Window and simulator to replay the model (ADR-0079); absent on older manifests. */
	replay?: ModelReplay;
	/** Shared parts the weights contain (FEATURE_SHARED_TRUNK); absent: self-contained. */
	components?: ModelComponent[];
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
	admission?: ModelAdmission;
	window?: ModelReplayWindow;
	components?: ModelComponent[];
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
	const {
		trainedWeights: _weights,
		heads: _heads,
		...genome
	} = artifact.bestGenome;
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
			evaluatedOn: summary.evaluatedOn,
		},
		...(artifact.bestGenome.network.actionSet && {
			actions: actionLabels(artifact.bestGenome.network.actionSet),
		}),
		...(artifact.admission && { admission: artifact.admission }),
		...(artifact.components && { components: artifact.components }),
		...(artifact.window && {
			replay: {
				intervalMs: CANDLE_INTERVAL_MS,
				simulator: SIMULATOR_PARAMS,
				...artifact.window,
				evalEpsilon: EVAL_EPSILON,
			},
		}),
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
