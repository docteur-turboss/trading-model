import {
	binary,
	brand,
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { toSymbol } from "@trading-model/primitives/primitives";
import { z } from "zod";
import {
	MODEL_FORMAT_VERSION,
	MODEL_SYMBOL_PATTERN,
	MODEL_VERSION_PATTERN,
} from "../../../domain/model-artifact";

/**
 * HTTP API of trader-trainer (ADR-0021): what the trainer has learnt, and
 * the model artifacts it keeps (ADR-0022). Each entry mounts its route
 * (`routes.ts`), validates its input and documents it in the OpenAPI.
 * Successful JSON responses are wrapped in `{ data }`. Everything is public
 * except the weights, which only leave through a service-to-service route.
 */

/** Everything needed to rebuild and deploy the best agent of a symbol. */
const BestAgentSummary = z.object({
	id: z.string(),
	generation: z.number().int(),
	fitness: z.number(),
	/** Sharpe of the bar-by-bar evaluation PnL, annualised (ADR-0025). */
	sharpe: z.number(),
	/** Mean final PnL of the evaluation episodes. */
	avgPnl: z.number(),
	/** Largest fall of the cumulative bar-by-bar evaluation PnL, >= 0. */
	maxDrawdown: z.number().nonnegative(),
	gaControl: z.object({
		populationSize: z.number().int(),
		elitismFraction: z.number(),
		survivorFraction: z.number(),
		episodesPerIndividual: z.number().int(),
		selectionType: z.string(),
		fitnessType: z.string(),
	}),
	network: z.object({
		inputDim: z.number().int(),
		outputDim: z.number().int(),
		hiddenLayers: z.array(
			z.object({ neurons: z.number().int(), activation: z.string() })
		),
	}),
	rl: z.object({
		gamma: z.number(),
		learningRate: z.number(),
		epsilonStart: z.number(),
		epsilonMin: z.number(),
		epsilonDecay: z.number(),
	}),
});

const ModelMetrics = z.object({
	/** 2: wallet PnL, annualised Sharpe (ADR-0025); absent: older metrics, not comparable. */
	metricsVersion: z.number().int().optional(),
	generation: z.number().int(),
	fitness: z.number(),
	sharpe: z.number(),
	avgPnl: z.number(),
	maxDrawdown: z.number().nonnegative(),
});

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

/** A stored version of a model, without its manifest body. */
const ModelSummary = z.object({
	symbol: z.string(),
	version: z.string(),
	createdAt: z.iso.datetime(),
	/** sha256 of the weights file: check a download against it. */
	sha256: SHA256,
	metrics: ModelMetrics,
});

/** Everything needed to rebuild and run the agent, except its weights. */
const ModelManifest = z.object({
	formatVersion: z.literal(MODEL_FORMAT_VERSION),
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
	genome: z.record(z.string(), z.unknown()),
	/** `fields[i]` is the meaning of input `i` of the network. */
	features: z.object({ dim: z.number().int(), fields: z.array(z.string()) }),
	/** Normalization statistics of the symbol at the end of training. */
	normalization: z.record(z.string(), z.unknown()),
	metrics: ModelMetrics,
});

const MODEL_SYMBOL = z.string().regex(MODEL_SYMBOL_PATTERN);
const MODEL = z.object({
	symbol: MODEL_SYMBOL,
	version: z.string().regex(MODEL_VERSION_PATTERN),
});

const AgentOfSymbol = z.object({
	symbol: z.string(),
	agent: BestAgentSummary,
	/** This symbol is the one being trained right now. */
	training: z.boolean(),
	generation: z.number().int(),
});

/** Before the first training, `symbol` is "" and `generation` 0. */
const TrainerState = {
	training: z.boolean(),
	symbol: z.string(),
	generation: z.number().int(),
};

export const TRAINER_API = {
	bestAgent: defineRoute({
		method: "GET",
		path: "/best-agent",
		summary: "Best agent of the last trained symbol",
		responses: {
			200: z.object({
				data: z.object({ agent: BestAgentSummary, ...TrainerState }),
			}),
			404: ErrorResponse,
		},
	}),
	trainingStatus: defineRoute({
		method: "GET",
		path: "/training-status",
		summary: "Whether a training runs, on which symbol and generation",
		responses: { 200: z.object({ data: z.object(TrainerState) }) },
	}),
	trainingAgents: defineRoute({
		method: "GET",
		path: "/training-agents",
		summary: "Best agent of every trained symbol",
		responses: {
			200: z.object({
				data: z.object({
					agents: z.array(AgentOfSymbol),
					training: z.boolean(),
					currentSymbol: z.string(),
				}),
			}),
		},
	}),
	trainingAgent: defineRoute({
		method: "GET",
		path: "/training-agents/:symbol",
		summary: "Best agent of a symbol, with its latest stored model",
		params: z.object({ symbol: z.string().min(1).transform(brand(toSymbol)) }),
		responses: {
			200: z.object({
				data: AgentOfSymbol.extend({
					/** Latest stored artifact of the symbol (`null` if none was written). */
					model: ModelSummary.nullable(),
				}),
			}),
			400: ErrorResponse,
			404: ErrorResponse,
		},
	}),
	listModels: defineRoute({
		method: "GET",
		path: "/models/:symbol",
		summary: "Stored model versions of a symbol, newest first",
		params: z.object({ symbol: MODEL_SYMBOL }),
		responses: {
			200: z.object({ data: z.array(ModelSummary) }),
			400: ErrorResponse,
		},
	}),
	getModel: defineRoute({
		method: "GET",
		path: "/models/:symbol/:version",
		summary: "Manifest of a model version (everything but the weights)",
		params: MODEL,
		responses: {
			200: z.object({ data: ModelManifest }),
			400: ErrorResponse,
			404: ErrorResponse,
		},
	}),
	/** Service-to-service only, and only for MODEL_DOWNLOAD_CALLERS (ADR-0022). */
	getModelWeights: defineRoute({
		method: "GET",
		path: "/models/:symbol/:version/weights",
		summary:
			"Weights of a model version: raw float32 little-endian, sha256 in x-model-sha256",
		params: MODEL,
		responses: {
			200: binary("application/octet-stream"),
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
			404: ErrorResponse,
		},
	}),
} as const;
