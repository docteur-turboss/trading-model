import type { DeliveredMessage } from "@trading-model/broker-message/messages.controller";
import type { createEvaluateModel } from "../../application/evaluate-model";
import { MODEL_EVALUATIONS_TOTAL } from "../../config/metrics";
import { PublishedModel } from "../../domain/model-evaluation";

/** Evaluates a `training.model.published` message; a malformed payload throws and the bus dead-letters it after its retries. */
export function createMessageHandler(
	evaluate: ReturnType<typeof createEvaluateModel>
): (message: DeliveredMessage, signal?: AbortSignal) => Promise<void> {
	return async ({ payload }, signal) => {
		const event = PublishedModel.parse(payload);
		MODEL_EVALUATIONS_TOTAL.inc({ outcome: await evaluate(event, signal) });
	};
}
