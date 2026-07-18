import fs from "node:fs/promises";
import path from "node:path";

import type { KeyPair } from "@trading-model/certificate-utils/keygen/types";
import type {
	CertificateBase,
	CertPemPair,
} from "@trading-model/common/domain/certificate-base";
import {
	toSerialNumber,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";

import type { ObtainedCertificate } from "./certificate-client";

export interface StoreConfig {
	tlsPaths: TlsPaths;
}

export class DiskCertificateStore {
	constructor(private readonly _config: StoreConfig) {}

	async writeCertificates(
		keyPair: KeyPair,
		response: CertPemPair
	): Promise<void> {
		const { tlsPaths } = this._config;
		const certDir = path.dirname(tlsPaths.certPath);
		await fs.mkdir(certDir, { recursive: true });
		await fs.writeFile(tlsPaths.keyPath, keyPair.privateKey, { mode: 0o600 });
		await fs.writeFile(tlsPaths.certPath, response.certPem, { mode: 0o644 });
		await fs.writeFile(tlsPaths.caPath, response.caPem, { mode: 0o644 });
	}

	buildObtainedCert(
		keyPair: KeyPair,
		response: Omit<CertificateBase, "expiresAt"> & { expiresAt: string }
	): ObtainedCertificate {
		return {
			certPem: response.certPem,
			keyPem: keyPair.privateKey,
			caPem: response.caPem,
			serialNumber: toSerialNumber(response.serialNumber),
			expiresAt: UnixTimestamp.of(new Date(response.expiresAt).getTime()),
		};
	}
}
