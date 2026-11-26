import { createHash } from "node:crypto";
import { z } from "zod";
import { ACTION_SET_IDS } from "./agent/action-mapper";
import { DAY_MS } from "./features/feature-builder";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "./neural-network/type/enums";

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

/** Metrics a stored version carries (ADR-0025, ADR-0069). */
export const ModelMetricsSchema = z.object({
	/** 2: wallet PnL, annualised Sharpe (ADR-0025); absent: older metrics, not comparable. */
	metricsVersion: z.number().int().optional(),
	generation: z.number().int(),
	fitness: z.number(),
	sharpe: z.number(),
	avgPnl: z.number(),
	maxDrawdown: z.number().nonnegative(),
	evaluatedOn: z.enum(["validation", "test"]).optional(),
});

/**
 * The genes of a manifest genome (ADR-0022): what `replayModel` plays with
 * (`PolicyGenome`) and what the version summary shows.
 */
const ManifestGenome = z.looseObject({
	id: z.string(),
	gaControl: z.looseObject({
		population: z.looseObject({
			size: z.number().int(),
			elitismFraction: z.number(),
			survivorFraction: z.number(),
		}),
		evaluation: z.looseObject({ episodesPerIndividual: z.number().int() }),
		selectionType: z.string(),
		fitnessType: z.string(),
	}),
	network: z.looseObject({
		inputDim: z.number().int(),
		outputDim: z.number().int(),
		hiddenLayers: z.array(
			z.looseObject({
				neurons: z.number().int(),
				activation: z.enum(ActivationType),
				connectionType: z.enum(ConnectionType).optional(),
				biasType: z.enum(InitialisationType).optional(),
			})
		),
		normalization: z.enum(NormalisationType),
		actionSet: z.enum(ACTION_SET_IDS).optional(),
		inputMask: z.array(z.boolean()).optional(),
	}),
	rl: z.looseObject({
		gamma: z.number(),
		learningRate: z.number(),
		discretePolicy: z.looseObject({
			epsilonStart: z.number(),
			epsilonMin: z.number(),
			epsilonDecay: z.number(),
		}),
		horizon: z.looseObject({
			frameSkip: z.number().int(),
			decision: z
				.looseObject({
					mode: z.enum(["every_bar", "on_event"]),
					priceMove: z.number(),
					volumeMultiple: z.number(),
					minGap: z.number(),
				})
				.optional(),
		}),
	}),
});
export type ManifestGenome = z.infer<typeof ManifestGenome>;

/**
 * Manifest of a stored model, the contract between trader-trainer (producer),
 * model-evaluator and risk-execution (readers). Lives here, not in contracts:
 * its genome is typed by the model-runtime enums (`PolicyGenome`).
 */
export const ModelManifestSchema = z.object({
	formatVersion: z.literal(1),
	symbol: z.string(),
	version: z.string(),
	createdAt: z.iso.datetime(),
	producedBy: z.object({ instanceId: z.string() }),
	weights: z.object({
		file: z.literal("weights.f32"),
		dtype: z.literal("float32-le"),
		length: z.number().int(),
		sha256: SHA256,
	}),
	/** The best genome without weights: network topology, RL and GA genes. */
	genome: ManifestGenome,
	/** `fields[i]` is the meaning of input `i` of the network. */
	features: z.object({ dim: z.number().int(), fields: z.array(z.string()) }),
	/** Normalization statistics of the symbol at the end of training. */
	normalization: z.record(z.string(), z.unknown()),
	/** Constraint the policy learned under; absent on older manifests (DEFAULT_MAX_EXPOSURE_FRACTION). */
	riskLimits: z.object({ maxExposureFraction: z.number() }).optional(),
	metrics: ModelMetricsSchema,
	/** ADR-0030 verdict on the test segment (ADR-0069); absent: not admissible. */
	admission: z
		.object({
			admissible: z.boolean(),
			evaluatedOn: z.literal("test"),
			criteria: z.object({
				sharpe: z.number(),
				sortino: z.number(),
				calmar: z.number(),
				buyAndHoldSharpe: z.number(),
			}),
			thresholds: z.object({
				minSharpe: z.number(),
				minSortino: z.number(),
				minCalmar: z.number(),
			}),
		})
		.optional(),
	/** ADR-0076 step 4: `sector` = a manager over `components`; absent = an asset model (N-1 readers ignore it). */
	role: z.enum(["asset", "sector"]).optional(),
	/** Analysts of a sector, by `(symbol, version)`; older manifests list other components without a `symbol`. */
	components: z
		.array(
			z.looseObject({ symbol: z.string().optional(), version: z.string() })
		)
		.optional(),
	/** How a sector manager pools its analysts' signals; absent: `mean+max`. */
	pooling: z.enum(["mean", "mean+max"]).optional(),
	/** Window and simulator to replay the model (ADR-0079); absent on older manifests. */
	replay: z
		.object({
			from: z.number().int(),
			testFrom: z.number().int(),
			to: z.number().int(),
			intervalMs: z.number().int(),
			evalEpsilon: z.number(),
			simulator: z.object({
				initialCash: z.number(),
				feeRate: z.number(),
				executionCostRate: z.number(),
				tradeFraction: z.number(),
				observePosition: z.boolean(),
			}),
		})
		.optional(),
});
export type ModelManifestData = z.infer<typeof ModelManifestSchema>;

/** Safe in an identifier and in a URL path segment. */
export const KEY_PART = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

/** The part of the trainer manifest the decider and the evaluator rely on (ADR-0022). */
export const ModelManifest = ModelManifestSchema.pick({
	symbol: true,
	version: true,
	weights: true,
	genome: true,
	admission: true,
	replay: true,
	riskLimits: true,
	role: true,
	components: true,
	pooling: true,
});
export type ModelManifest = z.infer<typeof ModelManifest>;

export const MINUTE_MS = 60_000;

/** Bar lengths the scraper serves and the replay supports. */
export const isSupportedInterval = (intervalMs: number): boolean =>
	intervalMs === MINUTE_MS || intervalMs === DAY_MS;

/**
 * Checks the downloaded weights against the expected model (and its event
 * `sha256` when given), the manifest and the `x-model-sha256` header; throws
 * on any mismatch (ADR-0049 §1.2).
 */
export function verifyModel(input: {
	model: { symbol: string; version: string; sha256?: string };
	manifest: ModelManifest;
	weights: Uint8Array;
	headerSha256: string | undefined;
}): void {
	const { model, manifest, weights, headerSha256 } = input;
	const name = `${model.symbol}/${model.version}`;
	if (manifest.symbol !== model.symbol || manifest.version !== model.version) {
		throw new Error(
			`Manifest ${manifest.symbol}/${manifest.version} is not the expected ${name}`
		);
	}
	const actual = createHash("sha256").update(weights).digest("hex");
	const expected = manifest.weights.sha256;
	if (
		actual !== expected ||
		(model.sha256 ?? expected) !== expected ||
		headerSha256 !== expected
	) {
		throw new Error(
			`Weights of ${name} refused: sha256 ${actual} differs from the manifest ${expected}, the event ${model.sha256} or the header ${headerSha256}`
		);
	}
	if (weights.byteLength !== manifest.weights.length * 4) {
		throw new Error(
			`Weights of ${name} refused: ${weights.byteLength} bytes for ${manifest.weights.length} float32`
		);
	}
}
