import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import type { createEvaluateModel } from "../../application/evaluate-model";
import { MODEL_EVALUATIONS_TOTAL } from "../../config/metrics";
import { PublishedModel } from "../../domain/model-evaluation";
import type { EVALUATOR_API } from "./api-routes";

/** `POST /message`: parses the event, a malformed one is a 400 and never retried into success. */
export function createMessageHandler(
	evaluate: ReturnType<typeof createEvaluateModel>
): ApiRouteHandler<(typeof EVALUATOR_API)["receive"]> {
	return async ({ body }) => {
		const event = PublishedModel.safeParse(body.payload);
		if (!event.success) {
			return sendResponse(
				{ error: "Invalid training.model.published payload" },
				HTTP_STATUS.BAD_REQUEST
			);
		}
		const outcome = await evaluate(event.data);
		MODEL_EVALUATIONS_TOTAL.inc({ outcome });
		return sendResponse({ status: outcome }, HTTP_STATUS.OK);
	};
}
