import { ResponseException } from "@trading-model/http/adapters/inbound/response-exception";
import {
	type InstanceId,
	toAuthToken,
	toInstanceId,
} from "@trading-model/primitives/primitives";
import type { TokenValidation } from "@trading-model/primitives/token-validation";
import { isNonEmptyString } from "@trading-model/validation/domain/validation/primitives";

import type { ServiceRegistry } from "../domain/service-registry";

/** Validate the x-instance-token header against the stored token for a given instance. */
export async function validateInstanceToken(
	registry: ServiceRegistry,
	tokenHeader: string | string[] | undefined,
	instanceId: InstanceId
): Promise<void> {
	if (!isNonEmptyString(tokenHeader)) {
		throw ResponseException("Missing or invalid instance token").unauthorized();
	}

	const validation: TokenValidation = {
		token: toAuthToken(tokenHeader),
		instanceId: toInstanceId(instanceId),
	};
	if (!(await registry.tokenManager.validInstanceToken(validation))) {
		throw ResponseException("Invalid instance token").unauthorized();
	}
}
