import type { DeliveredMessage } from "@trading-model/broker-message/messages.controller";
import { deadLetterError } from "@trading-model/broker-message/shared/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { createEvaluateModel } from "../../application/evaluate-model";
import { MODEL_EVALUATIONS_TOTAL } from "../../config/metrics";
import { PublishedModel } from "../../domain/model-evaluation";

/** Evaluates a `training.model.published` message; a malformed payload is logged and goes to the dead stream at once, never retried into success. */
export function createMessageHandler(
	evaluate: ReturnType<typeof createEvaluateModel>
): (message: DeliveredMessage, signal?: AbortSignal) => Promise<void> {
	return async ({ metadata, payload }, signal) => {
		const event = PublishedModel.safeParse(payload);
		if (!event.success) {
			getLogger().warn("Invalid training.model.published payload rejected", {
				topic: metadata.topic,
				messageId: metadata.messageId,
				issues: event.error.issues.length,
			});
			throw deadLetterError("Invalid training.model.published payload", {
				reason: "REJECTED_BY_SUBSCRIBER",
			});
		}
		MODEL_EVALUATIONS_TOTAL.inc({
			outcome: await evaluate(event.data, signal),
		});
	};
}
