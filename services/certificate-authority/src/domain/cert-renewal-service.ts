import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import { logger } from "@trading-model/common/config/logger";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import {
	CsrPem,
	type SerialNumber,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import { CertificateIssuer } from "./certificate-issuer";
import { NonceConsumer } from "./nonce-consumer";
import { PopVerifier } from "./pop-verifier";

interface CertStore {
	getBySerial(
		serialNumber: SerialNumber
	): Promise<{ certPem: string; serviceId: ServiceId } | null>;
}

import type { NonceContext } from "../persistence/nonce-persister";

interface NonceStore {
	consume(context: NonceContext): Promise<boolean>;
}

export type SignServiceCertRequest = CertSignRequest;

interface CertificateAuthority {
	signServiceCertificate(
		request: SignServiceCertRequest
	): Promise<SignedCertificate>;
}

interface RenewalPopInput {
	certPem: string;
	nonce: string;
	signature: string;
	serviceId: ServiceId;
	oldSerialNumber: SerialNumber;
}

export class CertRenewalError extends Error {
	public readonly statusCode: number;
	public readonly code = "CertRenewalError";
	constructor(message: string, statusCode: number = HTTP_STATUS.BAD_REQUEST) {
		super(message);
		this.name = "CertRenewalError";
		this.statusCode = statusCode;
	}
}

export interface RenewCertRequest {
	serviceId: ServiceId;
	oldSerialNumber: SerialNumber;
	nonce: string;
	signature: string;
	csr: string;
}

export interface CertRenewalDeps {
	certStore: CertStore;
	nonceStore: NonceStore;
	ca: CertificateAuthority;
	lock?: import("@trading-model/validation/contracts/distributed-lock.types").IDistributedLock;
}

export class CertRenewalService {
	private readonly _popVerifier = new PopVerifier();
	private readonly _certStore: CertStore;
	private readonly _nonceConsumer: NonceConsumer;
	private readonly _certificateIssuer: CertificateIssuer;

	constructor(deps: CertRenewalDeps) {
		this._certStore = deps.certStore;
		this._nonceConsumer = new NonceConsumer(deps.nonceStore);
		this._certificateIssuer = new CertificateIssuer(deps.ca, deps.lock);
	}

	async renew(request: RenewCertRequest): Promise<SignedCertificate> {
		const { serviceId, oldSerialNumber, nonce, signature, csr } = request;
		await this._nonceConsumer.consume(nonce, serviceId);
		const oldCert = await this._getOldCertificate(oldSerialNumber);
		this._verifyPop({
			certPem: oldCert.certPem,
			nonce,
			signature,
			serviceId,
			oldSerialNumber,
		});
		return this._certificateIssuer.issue(serviceId, CsrPem.of(csr));
	}

	private async _getOldCertificate(
		oldSerialNumber: SerialNumber
	): Promise<{ certPem: string; serviceId: ServiceId }> {
		const oldCert = await this._certStore.getBySerial(oldSerialNumber);
		if (!oldCert) {
			throw new CertRenewalError(
				"Original certificate not found",
				HTTP_STATUS.NOT_FOUND
			);
		}
		return oldCert;
	}

	private _verifyPop(input: RenewalPopInput): void {
		const { certPem, nonce, signature, serviceId, oldSerialNumber } = input;
		if (!this._popVerifier.verify({ certPem, nonce, signature })) {
			logger.warn("Proof-of-possession failed", {
				context: { serviceId, oldSerialNumber },
			});
			throw new CertRenewalError(
				"Proof-of-possession failed — signature does not match certificate public key",
				HTTP_STATUS.FORBIDDEN
			);
		}
	}
}
