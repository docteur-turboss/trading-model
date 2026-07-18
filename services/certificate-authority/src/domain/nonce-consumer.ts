import type { ServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_STATUS } from "@trading-model/common/http-status";

import type { NonceStore } from "../persistence/nonce-store";
import { createCertRenewalError } from "./cert-renewal-service";

export async function consumeNonce(
	nonceStore: NonceStore,
	nonce: string,
	serviceId: ServiceId
): Promise<void> {
	if (!(await nonceStore.consume({ nonce, serviceId }))) {
		throw createCertRenewalError(
			"Invalid or expired nonce",
			HTTP_STATUS.UNAUTHORIZED
		);
	}
}
