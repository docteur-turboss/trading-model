import {
	type InstanceId,
	toAuthToken,
	toInstanceId,
} from "@trading-model/common/domain/primitives";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import { ResponseException } from "@trading-model/common/middleware/response-exception";
import { isNonEmptyString } from "@trading-model/validation/validation/primitives";

import type { ServiceRegistry } from "../core/service-registry";

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
