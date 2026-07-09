import { HTTP_STATUS } from "@trading-model/common/http-status";

import type { NonceContext } from "../persistence/nonce-persister";
import { CertRenewalError } from "./cert-renewal-service";

interface NonceStore {
	consume(context: NonceContext): Promise<boolean>;
}

export class NonceConsumer {
	constructor(private readonly _nonceStore: NonceStore) {}

	async consume(nonce: string, serviceId: string): Promise<void> {
		if (!(await this._nonceStore.consume({ nonce, serviceId }))) {
			throw new CertRenewalError(
				"Invalid or expired nonce",
				HTTP_STATUS.UNAUTHORIZED
			);
		}
	}
}
