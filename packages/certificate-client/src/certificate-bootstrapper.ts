import fs from "node:fs/promises";
import { logger } from "@trading-model/common/config/logger";
import { toAuthToken, toCsrPem } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import {
	CaClient,
	type SignCertificateRequest,
} from "@trading-model/crypto/ca/ca-client";
import {
	type BootstrapConfig,
	bootstrapConfigFromEnv,
} from "./certificate-bootstrap-config";
import { DiskCertificateStore } from "./certificate-store";
import { KeyGenerator } from "./key-generator";

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

	const keyGenerator = new KeyGenerator(config);
	const { keyPair, csr } = await keyGenerator.generateKeyAndCsr();
	const response = await _signWithCa(config, csr);
	const store = new DiskCertificateStore({ tlsPaths: config.tlsPaths });
	await store.writeCertificates(keyPair, response);

	logger.info("TLS certificate obtained and written to disk", {
		serviceId: config.serviceId,
		certPath: config.tlsPaths.certPath,
		serialNumber: response.serialNumber,
		expiresAt: response.expiresAt,
	});

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

async function _signWithCa(
	config: BootstrapConfig,
	csr: string
): Promise<
	import("@trading-model/crypto/ca/ca-client").WireCertificateResponse
> {
	const caClient = new CaClient({ baseUrl: config.caUrl, tls: config.tls });
	const request: SignCertificateRequest = {
		serviceId:
			config.serviceId as unknown as import("@trading-model/common/domain/primitives").ServiceId,
		csr: toCsrPem(csr),
		bootstrapToken: config.bootstrapToken
			? toAuthToken(config.bootstrapToken)
			: undefined,
	};
	return await caClient.signCertificate(request);
}
