import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import type { IDistributedLock } from "@trading-model/validation/contracts/distributed-lock.types";

import { createCertRenewalError } from "./cert-renewal-service";

export interface CertificateAuthority {
	signCertificate(request: CertSignRequest): Promise<SignedCertificate>;
}

export class CertificateIssuer {
	private readonly _lock: IDistributedLock | undefined;

	constructor(
		private readonly _ca: CertificateAuthority,
		private readonly _lock?: IDistributedLock
	) {}

	async signCertificate(request: CertSignRequest): Promise<SignedCertificate> {
		const acquired = (await this._lock?.acquire()) ?? true;
		if (!acquired) {
			throw createCertRenewalError(
				"Could not acquire distributed lock for certificate renewal",
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		try {
			return await this._ca.signCertificate(request);
		} finally {
			await this._lock?.release();
		}
	}
}
