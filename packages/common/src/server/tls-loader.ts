import fsPromises from "node:fs/promises";
import path from "node:path";
import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";

export async function loadTlsFiles(tls: TlsPaths): Promise<TlsPemBundle> {
	const [key, cert, ca] = await Promise.all([
		fsPromises.readFile(path.resolve(tls.keyPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.certPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.caPath), "utf8"),
	]);
	return { key, cert, ca };
}
