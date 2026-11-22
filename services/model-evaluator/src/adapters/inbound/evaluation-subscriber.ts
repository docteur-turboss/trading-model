import type { DeliveredMetadata } from "@trading-model/broker-message";
import { deadLetterError } from "@trading-model/broker-message/shared/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { ApiRouteHandler } from "@trading-model/http/api-route/mount-route";
import { sendResponse } from "@trading-model/http/response-exception";
import type { createEvaluateModel } from "../../application/evaluate-model";
import { MODEL_EVALUATIONS_TOTAL } from "../../config/metrics";
import { PublishedModel } from "../../domain/model-evaluation";
import type { EVALUATOR_API } from "./api-routes";

/** Evaluates a `training.model.published` payload; undefined when it is malformed (logged, never retried into success). */
function createModelPublishedHandler(
	evaluate: ReturnType<typeof createEvaluateModel>
) {
	return async (
		payload: unknown,
		metadata: DeliveredMetadata,
		signal?: AbortSignal
	) => {
		const event = PublishedModel.safeParse(payload);
		if (!event.success) {
			getLogger().warn("Invalid training.model.published payload rejected", {
				topic: metadata.topic,
				messageId: metadata.messageId,
				issues: event.error.issues.length,
			});
			return;
		}
		const outcome = await evaluate(event.data, signal);
		MODEL_EVALUATIONS_TOTAL.inc({ outcome });
		return outcome;
	};
}

/** Listener of `brokerMessage.on` (bus consumer): a malformed payload goes to the dead stream. */
export function createModelPublishedListener(
	evaluate: ReturnType<typeof createEvaluateModel>
) {
	const handle = createModelPublishedHandler(evaluate);
	return async (
		payload: unknown,
		metadata: DeliveredMetadata,
		signal?: AbortSignal
	): Promise<void> => {
		if (!(await handle(payload, metadata, signal))) {
			throw deadLetterError("Invalid training.model.published payload", {
				reason: "REJECTED_BY_SUBSCRIBER",
			});
		}
	};
}

/** `POST /message`: a malformed event is a 400. */
export function createMessageHandler(
	evaluate: ReturnType<typeof createEvaluateModel>
): ApiRouteHandler<(typeof EVALUATOR_API)["receive"]> {
	const handle = createModelPublishedHandler(evaluate);
	return async ({ body }) => {
		const outcome = await handle(body.payload, body.metadata);
		return outcome
			? sendResponse({ status: outcome }, HTTP_STATUS.OK)
			: sendResponse(
					{ error: "Invalid training.model.published payload" },
					HTTP_STATUS.BAD_REQUEST
				);
	};
}
