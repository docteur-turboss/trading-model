import fsPromises from "node:fs/promises";
import path from "node:path";
import {
	CaPem,
	CertPem,
	KeyPem,
} from "@trading-model/common/domain/primitives";
import type {
	TlsPaths,
	TlsPemBundle,
} from "@trading-model/common/domain/tls-paths";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";

export async function loadTlsFiles(tls: TlsPaths): Promise<TlsPemBundle> {
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
