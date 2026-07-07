import fs from "node:fs/promises";
import path from "node:path";
import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import {
	CaClient,
	type SignCertificateRequest,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import { toAuthToken } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import {
	type BootstrapConfig,
	bootstrapConfigFromEnv,
} from "./certificate-bootstrap-config";

export async function bootstrapFromEnv(
	env: Record<string, string | undefined>
): Promise<TlsPaths | null> {
	const config = bootstrapConfigFromEnv(env);
	if (!config) {
		return null;
	}
	return await bootstrapCertificate(config);
}

export async function bootstrapCertificate(
	config: BootstrapConfig
): Promise<TlsPaths> {
	const existing = await _tryLoadExistingCert(config);
	if (existing) {
		return existing;
	}

	const { keyPair, csr } = await _generateKeyAndCsr(config);
	const response = await _signWithCa(config, csr);
	await _writeCertFiles(config, keyPair.privateKey, response);

	return { ...config.tlsPaths };
}

async function _tryLoadExistingCert(
	config: BootstrapConfig
): Promise<TlsPaths | null> {
	try {
		await fs.access(config.tlsPaths.certPath);
		await fs.access(config.tlsPaths.keyPath);
		logger.info("TLS certificate already exists — skipping bootstrap", {
			certPath: config.tlsPaths.certPath,
		});
		return { ...config.tlsPaths };
	} catch (err) {
		logger.warn("TLS certificate files not found — proceeding with bootstrap", {
			err: normalizeError(err),
		});
		return null;
	}
}

async function _generateKeyAndCsr(config: BootstrapConfig): Promise<{
	keyPair: import("@trading-model/certificate-utils/generate-key-pair").KeyPair;
	csr: string;
}> {
	logger.info("Obtaining TLS certificate from CA", {
		serviceId: config.serviceId,
		caUrl: config.caUrl,
	});
	const keyPair = await generateKeyPairAsync(KeyAlgorithm.ecP384);
	const csr = await createCsrAsync({
		commonName: config.commonName,
		san: config.san,
		keyPem: keyPair.privateKey,
	});
	return { keyPair, csr };
}

async function _signWithCa(
	config: BootstrapConfig,
	csr: string
): Promise<
	import("@trading-model/common/ca/ca-client").SignCertificateResponse
> {
	const caClient = new CaClient({ baseUrl: config.caUrl, tls: config.tls });
	const request: SignCertificateRequest = {
		serviceId:
			config.serviceId as unknown as import("@trading-model/common/domain/primitives").ServiceId,
		csr,
		bootstrapToken: config.bootstrapToken ? toAuthToken(config.bootstrapToken) : undefined,
	};
	return await caClient.signCertificate(request);
}

async function _writeCertFiles(
	config: BootstrapConfig,
	privateKey: string,
	response: import("@trading-model/common/ca/ca-client").SignCertificateResponse
): Promise<void> {
	const certDir = path.dirname(config.tlsPaths.certPath);
	await fs.mkdir(certDir, { recursive: true });
	await _writeCertFile(config.tlsPaths.keyPath, privateKey, 0o600);
	await _writeCertFile(config.tlsPaths.certPath, response.certPem, 0o644);
	await _writeCertFile(config.tlsPaths.caPath, response.caPem, 0o644);
	_logCertWritten(config, response);
}

async function _writeCertFile(
	filePath: string,
	content: string,
	mode: number
): Promise<void> {
	await fs.writeFile(filePath, content, { mode });
}

function _logCertWritten(
	config: BootstrapConfig,
	response: import("@trading-model/common/ca/ca-client").SignCertificateResponse
): void {
	logger.info("TLS certificate obtained and written to disk", {
		serviceId: config.serviceId,
		certPath: config.tlsPaths.certPath,
		serialNumber: response.serialNumber,
		expiresAt: response.expiresAt,
	});
}
