import {
	TrainingEvent,
	type TrainingModelPublishedPayload,
} from "@trading-model/contracts/training-events";
import { toSymbol } from "@trading-model/primitives/primitives";
import { z } from "zod";

/** Validators of the training event payloads, by event type. */
export const TRAINING_EVENT_VALIDATORS = {
	[TrainingEvent.ModelPublished]: z.object({
		symbol: z.string().min(1).transform(toSymbol),
		generation: z.number(),
		fitness: z.number(),
		sharpe: z.number(),
		avgPnl: z.number(),
		maxDrawdown: z.number().min(0),
		evaluatedOn: z.enum(["validation", "test"]),
		agentId: z.string(),
		version: z.string().min(1),
		sha256: z.string().regex(/^[0-9a-f]{64}$/),
		admissible: z.boolean().optional(),
		gaControl: z.object({
			populationSize: z.number(),
			elitismFraction: z.number(),
			survivorFraction: z.number(),
			episodesPerIndividual: z.number(),
			selectionType: z.string(),
			fitnessType: z.string(),
		}),
		network: z.object({
			inputDim: z.number(),
			outputDim: z.number(),
			hiddenLayers: z.array(
				z.object({ neurons: z.number(), activation: z.string() })
			),
		}),
		rl: z.object({
			gamma: z.number(),
			learningRate: z.number(),
			epsilonStart: z.number(),
			epsilonMin: z.number(),
			epsilonDecay: z.number(),
		}),
	}) satisfies z.ZodType<TrainingModelPublishedPayload, unknown>,
};
