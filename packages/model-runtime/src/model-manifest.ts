import { z } from "zod";
import { ACTION_SET_IDS } from "./agent/action-mapper";
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
	/** Constraint the policy learned under; absent on older manifests (unbounded). */
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
