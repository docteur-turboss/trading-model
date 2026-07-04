import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import { logger } from "@trading-model/common/config/logger";

import { PopVerifier } from "./pop-verifier";

interface CertStore {
	getBySerial(
		serialNumber: string
	): Promise<{ certPem: string; serviceId: string } | null>;
}

interface NonceStore {
	consume(nonce: string, serviceId: string): Promise<boolean>;
}

interface CertificateAuthority {
	signServiceCertificate(
		serviceId: string,
		csr: string,
		ttlMs?: number
	): Promise<SignedCertificate>;
}

interface DistributedLock {
	acquire(): Promise<boolean>;
	release(): Promise<void>;
}

export class CertRenewalError extends Error {
	public readonly statusCode: number;
	constructor(message: string, statusCode = 400) {
		super(message);
		this.name = "CertRenewalError";
		this.statusCode = statusCode;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Domain service orchestrating certificate renewal with proof-of-possession verification.
 * Pure domain logic — no HTTP, no Express, no MongoDB.
 */
export class CertRenewalService {
	private readonly _popVerifier = new PopVerifier();

	constructor(
		private readonly _certStore: CertStore,
		private readonly _nonceStore: NonceStore,
		private readonly _ca: CertificateAuthority,
		private readonly _lock?: DistributedLock
	) {}

	/**
	 * Renews a certificate after verifying the client still holds the private key.
	 *
	 * @returns The newly issued signed certificate
	 * @throws CertRenewalError on validation failure
	 */
	async renew(
		serviceId: string,
		oldSerialNumber: string,
		nonce: string,
		signature: string,
		csr: string
	): Promise<SignedCertificate> {
		// 1. Verify the nonce was issued for this service (prevents replay attacks)
		if (!(await this._nonceStore.consume(nonce, serviceId))) {
			throw new CertRenewalError("Invalid or expired nonce", 401);
		}

		// 2. Retrieve the old certificate to get its public key
		const oldCert = await this._certStore.getBySerial(oldSerialNumber);
		if (!oldCert) {
			throw new CertRenewalError("Original certificate not found", 404);
		}

		// 3. Verify proof-of-possession (client still holds the private _key)
		if (!this._popVerifier.verify(oldCert.certPem, nonce, signature)) {
			logger.warn("Proof-of-possession failed", { serviceId, oldSerialNumber });
			throw new CertRenewalError(
				"Proof-of-possession failed — signature does not match certificate public key",
				403
			);
		}

		// 4. Issue the new certificate (with distributed lock to prevent double-issuance)
		if (this._lock) {
			const acquired = await this._lock.acquire();
			if (!acquired) {
				throw new CertRenewalError(
					"Could not acquire distributed lock for certificate renewal",
					503
				);
			}
			try {
				return await this._ca.signServiceCertificate(serviceId, csr);
			} finally {
				await this._lock.release();
			}
		}

		return this._ca.signServiceCertificate(serviceId, csr);
	}
}
