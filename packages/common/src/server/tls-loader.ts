import fsPromises from "node:fs/promises";
import path from "node:path";
import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";
import { CRYPTO } from "../crypto/crypto-constants";

export async function loadTlsFiles(tls: TlsPaths): Promise<TlsPemBundle> {
	const [keyPem, certPem, caPem] = await Promise.all([
		fsPromises.readFile(path.resolve(tls.keyPath), CRYPTO.UTF8),
		fsPromises.readFile(path.resolve(tls.certPath), CRYPTO.UTF8),
		fsPromises.readFile(path.resolve(tls.caPath), CRYPTO.UTF8),
	]);
	return { keyPem, certPem, caPem };
}
