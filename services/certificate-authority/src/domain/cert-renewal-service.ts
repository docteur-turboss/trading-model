import type { SignedCertificate } from "@trading-model/certificate-utils/keygen/types";
import { logger } from "@trading-model/common/config/logger";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import {
	CsrPem,
	type SerialNumber,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import type { CertificateStore } from "../persistence/certificate-store";
import type { NonceStore } from "../persistence/nonce-store";
import type { CertificateAuthority } from "./certificate-issuer";
import { CertificateIssuer } from "./certificate-issuer";
import { consumeNonce } from "./nonce-consumer";
import { verifyProofOfPossession } from "./pop-verifier";

export type SignServiceCertRequest = CertSignRequest;

interface RenewalPopInput {
	certPem: string;
	nonce: string;
	signature: string;
	serviceId: ServiceId;
	oldSerialNumber: SerialNumber;
}

export interface CertRenewalErrorData {
	readonly name: "CertRenewalError";
	readonly message: string;
	readonly statusCode: number;
	readonly code: "CertRenewalError";
}

export type CertRenewalError = Error & CertRenewalErrorData;

export function createCertRenewalError(
	message: string,
	statusCode: number = HTTP_STATUS.BAD_REQUEST
): CertRenewalError {
	const err = Object.assign(new Error(message), {
		name: "CertRenewalError",
		code: "CertRenewalError",
		statusCode,
	}) as CertRenewalError;
	return err;
}

export function isCertRenewalError(err: unknown): err is CertRenewalError {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as CertRenewalError).name === "CertRenewalError"
	);
}

export interface RenewCertRequest {
	serviceId: ServiceId;
	oldSerialNumber: SerialNumber;
	nonce: string;
	signature: string;
	csr: string;
}

export interface CertRenewalDeps {
	certStore: CertificateStore;
	nonceStore: NonceStore;
	ca: CertificateAuthority;
	lock?: import("@trading-model/validation/contracts/distributed-lock.types").IDistributedLock;
}

export class CertRenewalService {
	private readonly _certStore: CertificateStore;
	private readonly _nonceStore: NonceStore;
	private readonly _certificateIssuer: CertificateIssuer;

	constructor(deps: CertRenewalDeps) {
		this._certStore = deps.certStore;
		this._nonceStore = deps.nonceStore;
		this._certificateIssuer = new CertificateIssuer(deps.ca, deps.lock);
	}

	async renew(request: RenewCertRequest): Promise<SignedCertificate> {
		const { serviceId, oldSerialNumber, nonce, signature, csr } = request;
		await consumeNonce(this._nonceStore, nonce, serviceId);
		const oldCert = await this._getOldCertificate(oldSerialNumber);
		this._verifyPop({
			certPem: oldCert.certPem,
			nonce,
			signature,
			serviceId,
			oldSerialNumber,
		});
		return this._certificateIssuer.signCertificate({
			serviceId,
			csr: CsrPem.of(csr),
		});
	}

	private async _getOldCertificate(
		oldSerialNumber: SerialNumber
	): Promise<{ certPem: string; serviceId: ServiceId }> {
		const oldCert = await this._certStore.getBySerial(oldSerialNumber);
		if (!oldCert) {
			throw createCertRenewalError(
				"Original certificate not found",
				HTTP_STATUS.NOT_FOUND
			);
		}
		return oldCert;
	}

	private _verifyPop(input: RenewalPopInput): void {
		const { certPem, nonce, signature, serviceId, oldSerialNumber } = input;
		if (!verifyProofOfPossession({ certPem, nonce, signature })) {
			logger.warn("Proof-of-possession failed", {
				context: { serviceId, oldSerialNumber },
			});
			throw createCertRenewalError(
				"Proof-of-possession failed — signature does not match certificate public key",
				HTTP_STATUS.FORBIDDEN
			);
		}
	}
}
