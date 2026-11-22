import fs from "node:fs";
import fsPromises from "node:fs/promises";
import type https from "node:https";
import path from "node:path";
import tls from "node:tls";
import type {
	TlsPaths,
	TlsPemBundle,
} from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import {
	extractCanonicalServiceName,
	normalizeServiceName,
} from "@trading-model/common/utils/spiffe";
import { CaPem, CertPem, KeyPem } from "@trading-model/primitives/primitives";

function readTlsFileSync(filePath: string, label: string): string {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch (err) {
		const original = normalizeError(err);
		original.message = `Failed to read TLS ${label} from "${filePath}": ${original.message}`;
		throw original;
	}
}

/** Max delay before a rotated SVID file is noticed by the sync loader. */
export const TLS_RELOAD_CHECK_INTERVAL_MS = 5000;

interface CachedBundle {
	bundle: Partial<TlsPemBundle>;
	stamp: string;
	checkedAt: number;
}

const bundleCache = new Map<string, CachedBundle>();

function statStamp(paths: string[]): string {
	return paths
		.map((file) => {
			const st = fs.statSync(file);
			return `${st.mtimeMs}:${st.ino}:${st.size}`;
		})
		.join("|");
}

/**
 * Synchronous variant for constructors – accepts optional partial paths.
 * Cached in memory; the files are stat-ed at most every
 * `TLS_RELOAD_CHECK_INTERVAL_MS` and all re-read together when one changed
 * (cert and key must stay a consistent pair). A failed reload keeps the
 * previous bundle and is retried at the next check.
 */
export function loadTlsPemBundleSync(
	tlsConfig?: Partial<TlsPaths>
): Partial<TlsPemBundle> {
	if (!tlsConfig) {
		return {};
	}
	const paths = [
		tlsConfig.caPath,
		tlsConfig.certPath,
		tlsConfig.keyPath,
	].filter((file): file is NonNullable<typeof file> => Boolean(file));
	const cacheKey = [
		tlsConfig.caPath,
		tlsConfig.certPath,
		tlsConfig.keyPath,
	].join("\0");
	const now = Date.now();
	const cached = bundleCache.get(cacheKey);
	if (cached && now - cached.checkedAt < TLS_RELOAD_CHECK_INTERVAL_MS) {
		return cached.bundle;
	}
	try {
		const stamp = statStamp(paths);
		if (cached && cached.stamp === stamp) {
			cached.checkedAt = now;
			return cached.bundle;
		}
		const bundle = readBundleSync(tlsConfig);
		bundleCache.set(cacheKey, { bundle, stamp, checkedAt: now });
		return bundle;
	} catch (err) {
		if (!cached) {
			throw err;
		}
		cached.checkedAt = now;
		process.emitWarning(
			`TLS reload failed, keeping previous bundle: ${normalizeError(err).message}`
		);
		return cached.bundle;
	}
}

function readBundleSync(tlsConfig: Partial<TlsPaths>): Partial<TlsPemBundle> {
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
		fsPromises.readFile(path.resolve(tls.keyPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.certPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.caPath), "utf8"),
	]);
	return {
		keyPem: KeyPem.of(keyPem),
		certPem: CertPem.of(certPem),
		caPem: CaPem.of(caPem),
	};
}

/**
 * Server identity check for mTLS clients. SVIDs carry only a `spiffe://` URI
 * SAN, so with a known target the SAN's service must equal it (ADR-0011); with
 * no known target Node's hostname verification applies.
 */
export function spiffeServerIdentityCheck(
	expectedService?: string
): NonNullable<https.AgentOptions["checkServerIdentity"]> {
	return (host, cert) => {
		if (!expectedService) {
			return tls.checkServerIdentity(host, cert);
		}
		const actual = extractCanonicalServiceName(cert.subjectaltname ?? "");
		if (actual !== normalizeServiceName(expectedService)) {
			return Object.assign(
				new Error(
					`Server SVID is ${actual ?? "unknown"}, expected ${expectedService}`
				),
				{ code: "ERR_TLS_CERT_ALTNAME_INVALID" }
			);
		}
	};
}

/** TLS client options of a PEM bundle; the server must present `expectedService`'s SVID. */
export function buildTlsClientOptions(
	bundle: Partial<TlsPemBundle>,
	expectedService?: string
): https.AgentOptions {
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
	if (bundle.caPem || bundle.certPem) {
		opts.checkServerIdentity = spiffeServerIdentityCheck(expectedService);
	}
	return opts;
}

/** Builds the HTTPS agent options from the TLS paths; the server must present `expectedService`'s SVID. */
export function buildHttpsAgentOptions(
	tlsConfig?: TlsPaths,
	expectedService?: string
): https.AgentOptions | undefined {
	return (
		tlsConfig &&
		buildTlsClientOptions(loadTlsPemBundleSync(tlsConfig), expectedService)
	);
}
