import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import type {
	CsrPem,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import type { IDistributedLock } from "@trading-model/validation/contracts/distributed-lock.types";

import { CertRenewalError } from "./cert-renewal-service";

interface CertificateAuthority {
	signServiceCertificate(
		request: import("@trading-model/common/domain/cert-signing").CertSignRequest
	): Promise<SignedCertificate>;
}

export class CertificateIssuer {
	private readonly _lock: IDistributedLock | undefined;

	constructor(
		private readonly _ca: CertificateAuthority,
		private readonly _lock?: IDistributedLock
	) {}

	async issue(serviceId: ServiceId, csr: CsrPem): Promise<SignedCertificate> {
		const acquired = (await this._lock?.acquire()) ?? true;
		if (!acquired) {
			throw new CertRenewalError(
				"Could not acquire distributed lock for certificate renewal",
				HTTP_STATUS.SERVICE_UNAVAILABLE
			);
		}
		try {
			return await this._ca.signServiceCertificate({
				serviceId: toServiceId(serviceId),
				csr,
			});
		} finally {
			await this._lock?.release();
		}
	}
}
