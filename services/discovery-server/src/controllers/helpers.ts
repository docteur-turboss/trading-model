import { ResponseException } from "@trading-model/common/middleware/response-exception";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import { isNonEmptyString } from "@trading-model/common/validation/primitives";

import type { ServiceRegistry } from "../core/service-registry";

/** Validate the x-instance-token header against the stored token for a given instance. */
export function validateInstanceToken(
	registry: ServiceRegistry,
	tokenHeader: string | string[] | undefined,
	instanceId: string
): void {
	if (!isNonEmptyString(tokenHeader)) {
		throw ResponseException("Missing or invalid instance token").unauthorized();
	}

	const validation: TokenValidation = { token: tokenHeader, instanceId: toInstanceId(instanceId) };
	if (!registry.validInstanceToken(validation)) {
		throw ResponseException("Invalid instance token").unauthorized();
	}
}
