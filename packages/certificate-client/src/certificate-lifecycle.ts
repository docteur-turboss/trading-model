import fs from "node:fs/promises";
import path from "node:path";

import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import type { KeyPair } from "@trading-model/certificate-utils/types";
import type {
	CaClient,
	SignCertificateRequest,
} from "@trading-model/common/ca/ca-client";
import { toSerialNumber } from "@trading-model/common/domain/primitives";
import type {
	CertificateClientConfig,
	ObtainedCertificate,
} from "./certificate-client";

export class CertificateLifecycle {
	constructor(
		private readonly _config: CertificateClientConfig,
		private readonly _caClient: CaClient
	) {}

	async generateKeyAndCsr(): Promise<{
		keyPair: KeyPair;
		csr: string;
	}> {
		const keyPair = await generateKeyPairAsync(
			this._config.keyAlgorithm ?? KeyAlgorithm.ecP384
		);
		const csr = await createCsrAsync({
			commonName: this._config.commonName,
			san: this._config.san,
			keyPem: keyPair.privateKey,
		});
		return { keyPair, csr };
	}

	async signWithCa(csr: string) {
		const request: SignCertificateRequest = {
			serviceId: this._config.serviceId,
			csr,
			bootstrapToken: this._config.bootstrapToken,
		};
		return await this._caClient.signCertificate(request);
	}

	async writeCertificates(
		keyPair: { privateKey: string },
		response: { cert: string; caPem: string }
	): Promise<void> {
		const { tlsPaths } = this._config;
		const certDir = path.dirname(tlsPaths.certPath);
		await fs.mkdir(certDir, { recursive: true });
		await fs.writeFile(tlsPaths.keyPath, keyPair.privateKey, { mode: 0o600 });
		await fs.writeFile(tlsPaths.certPath, response.cert, { mode: 0o644 });
		await fs.writeFile(tlsPaths.caPath, response.caPem, { mode: 0o644 });
	}

	buildObtainedCert(
		keyPair: { privateKey: string },
		response: {
			cert: string;
			caPem: string;
			serialNumber: string;
			expiresAt: string;
		}
	): ObtainedCertificate {
		return {
			certPem: response.cert,
			keyPem: keyPair.privateKey,
			caPem: response.caPem,
			serialNumber: toSerialNumber(response.serialNumber),
			expiresAt: new Date(response.expiresAt),
		};
	}

	notifyOnRenew(
		onRenew: ((cert: ObtainedCertificate) => void) | undefined,
		cert: ObtainedCertificate
	): void {
		if (onRenew) {
			setImmediate(() => onRenew(cert));
		}
	}
}
