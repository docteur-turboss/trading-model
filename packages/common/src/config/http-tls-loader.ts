import fs from "node:fs";
import type https from "node:https";

import { CRYPTO } from "../crypto/crypto-constants";
import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";

function readTlsFileSync(filePath: string, label: string): string {
	try {
		return fs.readFileSync(filePath, CRYPTO.UTF8);
	} catch (err) {
		const original = normalizeError(err);
		original.message = `Failed to read TLS ${label} from "${filePath}": ${original.message}`;
		throw original;
	}
}

export function loadTlsPemBundle(
	tlsConfig?: Partial<TlsPemBundle>
): Partial<TlsPemBundle> {
	if (!tlsConfig) {
		return {};
	}
	const result: Partial<TlsPemBundle> = {};
	if (tlsConfig.caPem) {
		result.caPem = readTlsFileSync(tlsConfig.caPem, "CA certificate");
	}
	if (tlsConfig.certPem) {
		result.certPem = readTlsFileSync(tlsConfig.certPem, "client certificate");
	}
	if (tlsConfig.keyPem) {
		result.keyPem = readTlsFileSync(tlsConfig.keyPem, "client key");
	}
	return result;
}

export function buildHttpsAgentOptions(
	tlsConfig?: TlsPaths
): https.AgentOptions | undefined {
	if (!tlsConfig) {
		return;
	}
	const bundle = loadTlsPemBundle({
		caPem: tlsConfig.caPath,
		certPem: tlsConfig.certPath,
		keyPem: tlsConfig.keyPath,
	});
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
