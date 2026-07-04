import { ResponseException } from "@trading-model/common/middleware/response-exception";
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

	if (!registry.validInstanceToken(tokenHeader, instanceId)) {
		throw ResponseException("Invalid instance token").unauthorized();
	}
}
