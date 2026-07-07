import type { SignOptions } from "@trading-model/certificate-utils/sign-certificate";
import { signCertificate } from "@trading-model/certificate-utils/sign-certificate";
import type {
	KeyPair,
	RevokedCertificate,
	SignedCertificate,
} from "@trading-model/certificate-utils/types";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import { toServiceId } from "@trading-model/common/domain/primitives";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import { ENV } from "../config/env";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";

export class CertificateOperator {
	constructor(
		private readonly _certificateStore: CertificateStore,
		private readonly _crlStore: CrlStore
	) {}

	async signServiceCertificate(
		request: CertSignRequest,
		caKeyPair: KeyPair,
		caCertPem: string
	): Promise<SignedCertificate> {
		const { serviceId, csr, ttlMs } = request;
		const options: SignOptions = {
			csr,
			serviceId: toServiceId(serviceId),
			caKeyPair,
			caCertPem,
			ttlMs: ttlMs ?? ENV.CERT_DEFAULT_TTL_MS,
		};

		const signed = signCertificate(options);

		await this._certificateStore.save(signed);

		return signed;
	}

	private _buildRevokedCertificate(
		request: RevocationRequest,
		serviceId: string
	): RevokedCertificate {
		return {
			serialNumber: request.serialNumber,
			serviceId: toServiceId(serviceId),
			revokedAt: new Date(),
			reason: request.reason,
		};
	}

	async revokeCertificate(request: RevocationRequest): Promise<void> {
		const cert = await this._certificateStore.getBySerial(request.serialNumber);
		if (!cert) {
			throw new Error(`Certificate ${request.serialNumber} not found`);
		}
		const revoked = this._buildRevokedCertificate(request, cert.serviceId);
		await this._crlStore.save(revoked);
	}

	async getCrl(): Promise<RevokedCertificate[]> {
		return await this._crlStore.getAll();
	}
}
