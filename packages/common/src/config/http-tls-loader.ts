import fs from "node:fs";
import fsPromises from "node:fs/promises";
import type https from "node:https";
import path from "node:path";

import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";
import { CaPem, CertPem, KeyPem } from "../domain/primitives";
import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";

function readTlsFileSync(filePath: string, label: string): string {
	try {
		return fs.readFileSync(filePath, CryptoAlg.UTF8);
	} catch (err) {
		const original = normalizeError(err);
		original.message = `Failed to read TLS ${label} from "${filePath}": ${original.message}`;
		throw original;
	}
}

/** Synchronous variant for constructors – accepts optional partial paths. */
export function loadTlsPemBundleSync(
	tlsConfig?: Partial<TlsPaths>
): Partial<TlsPemBundle> {
	if (!tlsConfig) {
		return {};
	}
	const result: Partial<TlsPemBundle> = {};
	if (tlsConfig.caPath) {
		result.caPem = CaPem.of(
			readTlsFileSync(tlsConfig.caPath, "CA certificate")
		);
	}
	if (tlsConfig.certPath) {
		result.certPem = CertPem.of(
			readTlsFileSync(tlsConfig.certPath, "client certificate")
		);
	}
	if (tlsConfig.keyPath) {
		result.keyPem = KeyPem.of(readTlsFileSync(tlsConfig.keyPath, "client key"));
	}
	return result;
}

/** Canonical async version – reads all three files in parallel. */
export async function loadTlsPemBundle(tls: TlsPaths): Promise<TlsPemBundle> {
	const [keyPem, certPem, caPem] = await Promise.all([
		fsPromises.readFile(path.resolve(tls.keyPath), CryptoAlg.UTF8),
		fsPromises.readFile(path.resolve(tls.certPath), CryptoAlg.UTF8),
		fsPromises.readFile(path.resolve(tls.caPath), CryptoAlg.UTF8),
	]);
	return {
		keyPem: KeyPem.of(keyPem),
		certPem: CertPem.of(certPem),
		caPem: CaPem.of(caPem),
	};
}

export function buildHttpsAgentOptions(
	tlsConfig?: TlsPaths
): https.AgentOptions | undefined {
	if (!tlsConfig) {
		return;
	}
	const bundle = loadTlsPemBundleSync(tlsConfig);
	const opts: https.AgentOptions = {};
	if (bundle.caPem) {
		opts.ca = bundle.caPem;
	}
	if (bundle.certPem) {
		opts.cert = bundle.certPem;
	}
	if (bundle.keyPem) {
		opts.key = bundle.keyPem;
	}
	return opts;
}
