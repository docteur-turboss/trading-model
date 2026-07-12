import fs from "node:fs";
import type https from "node:https";

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

export function loadTlsPemBundle(
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

export function buildHttpsAgentOptions(
	tlsConfig?: TlsPaths
): https.AgentOptions | undefined {
	if (!tlsConfig) {
		return;
	}
	const bundle = loadTlsPemBundle(tlsConfig);
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
