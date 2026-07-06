import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import { logger } from "@trading-model/common/config/logger";
import type { IDistributedLock } from "@trading-model/common/contracts/distributed-lock.types";
import type { SerialNumber } from "@trading-model/common/domain/primitives";

import { PopVerifier } from "./pop-verifier";

interface CertStore {
	getBySerial(
		serialNumber: SerialNumber
	): Promise<{ certPem: string; serviceId: string } | null>;
}

import type { NonceContext } from "../persistence/nonce-persister";

interface NonceStore {
	consume(context: NonceContext): Promise<boolean>;
}

export interface SignServiceCertRequest {
	serviceId: string;
	csr: string;
	ttlMs?: number;
}

interface CertificateAuthority {
	signServiceCertificate(
		request: SignServiceCertRequest
	): Promise<SignedCertificate>;
}

class NullDistributedLock implements IDistributedLock {
	async acquire(_lockId?: string): Promise<boolean> {
		return true;
	}
	async release(_lockId?: string): Promise<void> {}
}

interface RenewalPopInput {
	certPem: string;
	nonce: string;
	signature: string;
	serviceId: string;
	oldSerialNumber: SerialNumber;
}

export class CertRenewalError extends Error {
	public readonly statusCode: number;
	constructor(message: string, statusCode = 400) {
		super(message);
		this.name = "CertRenewalError";
		this.statusCode = statusCode;
	}
}

export interface RenewCertRequest {
	serviceId: string;
	oldSerialNumber: SerialNumber;
	nonce: string;
	signature: string;
	csr: string;
}

export interface CertRenewalDeps {
	certStore: CertStore;
	nonceStore: NonceStore;
	ca: CertificateAuthority;
	lock?: IDistributedLock;
}

/**
 * Domain service orchestrating certificate renewal with proof-of-possession verification.
 * Pure domain logic — no HTTP, no Express, no MongoDB.
 */
export class CertRenewalService {
	private readonly _popVerifier = new PopVerifier();
	private readonly _certStore: CertStore;
	private readonly _nonceStore: NonceStore;
	private readonly _ca: CertificateAuthority;
	private readonly _lock: IDistributedLock;

	constructor(deps: CertRenewalDeps) {
		this._certStore = deps.certStore;
		this._nonceStore = deps.nonceStore;
		this._ca = deps.ca;
		this._lock = deps.lock ?? new NullDistributedLock();
	}

	/**
	 * Renews a certificate after verifying the client still holds the private key.
	 *
	 * @returns The newly issued signed certificate
	 * @throws CertRenewalError on validation failure
	 */
	async renew(request: RenewCertRequest): Promise<SignedCertificate> {
		const { serviceId, oldSerialNumber, nonce, signature, csr } = request;
		await this._consumeNonce(nonce, serviceId);
		const oldCert = await this._getOldCertificate(oldSerialNumber);
		this._verifyPop({
			certPem: oldCert.certPem,
			nonce,
			signature,
			serviceId,
			oldSerialNumber,
		});
		return this._issueCertificate(serviceId, csr);
	}

	private async _consumeNonce(nonce: string, serviceId: string): Promise<void> {
		if (!(await this._nonceStore.consume({ nonce, serviceId }))) {
			throw new CertRenewalError("Invalid or expired nonce", 401);
		}
	}

	private async _getOldCertificate(
		oldSerialNumber: SerialNumber
	): Promise<{ certPem: string; serviceId: string }> {
		const oldCert = await this._certStore.getBySerial(oldSerialNumber);
		if (!oldCert) {
			throw new CertRenewalError("Original certificate not found", 404);
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
				403
			);
		}
	}

	private async _issueCertificate(
		serviceId: string,
		csr: string
	): Promise<SignedCertificate> {
		const acquired = await this._lock.acquire();
		if (!acquired) {
			throw new CertRenewalError(
				"Could not acquire distributed lock for certificate renewal",
				503
			);
		}
		try {
			return await this._ca.signServiceCertificate({ serviceId, csr });
		} finally {
			await this._lock.release();
		}
	}
}
