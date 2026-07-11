import fsPromises from "node:fs/promises";
import path from "node:path";
import { CryptoAlg } from "../crypto/crypto-constants";
import { CaPem, CertPem, KeyPem } from "../domain/primitives";
import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";

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
