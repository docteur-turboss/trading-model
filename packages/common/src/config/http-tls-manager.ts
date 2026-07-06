import fs from "node:fs";

import type { TlsPaths } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";

/**
 * Reads a TLS file (key, cert, or CA) from disk.
 * Throws a typed error if the file is missing or unreadable.
 */
async function readTlsFile(filePath: string, label: string): Promise<string> {
	try {
		await fs.promises.access(filePath, fs.constants.R_OK);
		return await fs.promises.readFile(filePath, "utf8");
	} catch (err) {
		const original = normalizeError(err);
		original.message = `Failed to read TLS ${label} from "${filePath}": ${original.message}`;
		throw original;
	}
}

export class TlsManager {
	private _ca?: string;
	private _cert?: string;
	private _key?: string;
	private _loaded = false;
	private _loadPromise: Promise<void> | null = null;

	constructor(private readonly _paths?: Partial<TlsPaths>) {}

	async ensureLoaded(): Promise<void> {
		if (this._loaded || !this._paths) {
			return;
		}

		this._loadPromise ??= (async () => {
			if (!this._paths) {
				this._loaded = true;
				return;
			}
			const { caPath, certPath, keyPath } = this._paths;
			if (caPath) {
				this._ca = await readTlsFile(caPath, "CA certificate");
			}
			if (certPath) {
				this._cert = await readTlsFile(certPath, "client certificate");
			}
			if (keyPath) {
				this._key = await readTlsFile(keyPath, "client key");
			}
			this._loaded = true;
		})();

		return await this._loadPromise;
	}

	get ca(): string | undefined {
		return this._ca;
	}
	get cert(): string | undefined {
		return this._cert;
	}
	get key(): string | undefined {
		return this._key;
	}
	get loaded(): boolean {
		return this._loaded;
	}
}
