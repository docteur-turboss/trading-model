import {
	type InstanceId,
	toAuthToken,
	toInstanceId,
} from "@trading-model/common/domain/primitives";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import {
	ResponseException,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { isNonEmptyString } from "@trading-model/validation/shared/validation/primitives";
import type { z } from "zod";

import type { ServiceRegistry } from "../domain/service-registry";

/** Builds the standard 400 response for a Zod validation failure. */
export function validationErrorResponse(
	schema: z.ZodType,
	body: unknown
): ReturnType<typeof sendResponse> {
	return sendResponse(
		{
			error: "Invalid request body",
			details: schema.safeParse(body).error!.flatten().fieldErrors,
		},
		400 as HttpStatusCode
	);
}

/** Validate the x-instance-token header against the stored token for a given instance. */
export function validateInstanceToken(
	registry: ServiceRegistry,
	tokenHeader: string | string[] | undefined,
	instanceId: InstanceId
): void {
	if (!isNonEmptyString(tokenHeader)) {
		throw ResponseException("Missing or invalid instance token").unauthorized();
	}

	const validation: TokenValidation = {
		token: toAuthToken(tokenHeader),
		instanceId: toInstanceId(instanceId),
	};
	if (!registry.tokenManager.validInstanceToken(validation)) {
		throw ResponseException("Invalid instance token").unauthorized();
	}
}
