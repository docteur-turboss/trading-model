import fsPromises from "node:fs/promises";
import path from "node:path";
import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";

export async function loadTlsFiles(tls: TlsPaths): Promise<TlsPemBundle> {
	const [keyPem, certPem, caPem] = await Promise.all([
		fsPromises.readFile(path.resolve(tls.keyPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.certPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.caPath), "utf8"),
	]);
	return { keyPem, certPem, caPem };
}
