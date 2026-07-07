import fs from "node:fs";
import https from "node:https";

import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";

function readTlsFileSync(filePath: string, label: string): string {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch (err) {
		const original = normalizeError(err);
		original.message = `Failed to read TLS ${label} from "${filePath}": ${original.message}`;
		throw original;
	}
}

export function loadTlsPemBundle(tlsConfig?: Partial<TlsPemBundle>): Partial<TlsPemBundle> {
	if (!tlsConfig) {
		return {};
	}
	const result: Partial<TlsPemBundle> = {};
	if (tlsConfig.ca) {
		result.ca = readTlsFileSync(tlsConfig.ca, "CA certificate");
	}
	if (tlsConfig.cert) {
		result.cert = readTlsFileSync(tlsConfig.cert, "client certificate");
	}
	if (tlsConfig.key) {
		result.key = readTlsFileSync(tlsConfig.key, "client key");
	}
	return result;
}

export function buildHttpsAgentOptions(tlsConfig?: TlsPaths): https.AgentOptions | undefined {
	if (!tlsConfig) {
		return undefined;
	}
	const bundle = loadTlsPemBundle({
		ca: tlsConfig.caPath,
		cert: tlsConfig.certPath,
		key: tlsConfig.keyPath,
	});
	const opts: https.AgentOptions = {};
	if (bundle.ca) opts.ca = bundle.ca;
	if (bundle.cert) opts.cert = bundle.cert;
	if (bundle.key) opts.key = bundle.key;
	return opts;
}
