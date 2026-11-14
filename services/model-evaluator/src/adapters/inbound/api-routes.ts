import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { z } from "zod";

/** HTTP API of model-evaluator: the broker callback only (service-to-service). */
export const EVALUATOR_API = {
	receive: defineRoute({
		method: "POST",
		path: "/message",
		summary:
			"Evaluate a model announced by message-manager (training.model.published)",
		body: z.looseObject({
			metadata: z.looseObject({ topic: z.string().min(1) }),
			payload: z.unknown().optional(),
		}),
		responses: {
			/** Acknowledges the delivery, a redelivery included. */
			200: z.object({ status: z.enum(["recorded", "duplicate"]) }),
			400: ErrorResponse,
		},
	}),
} as const;
