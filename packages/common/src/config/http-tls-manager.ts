import fs from "node:fs";

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

export interface TlsCertPaths {
	ca?: string;
	cert?: string;
	key?: string;
}

export class TlsManager {
	private _ca?: string;
	private _cert?: string;
	private _key?: string;
	private _loaded = false;
	private _loadPromise: Promise<void> | null = null;

	constructor(private readonly _paths?: TlsCertPaths) {}

	async ensureLoaded(): Promise<void> {
		if (this._loaded || !this._paths) {
			return;
		}

		this._loadPromise ??= (async () => {
			if (!this._paths) {
				this._loaded = true;
				return;
			}
			const { ca, cert, key } = this._paths;
			if (ca) {
				this._ca = await readTlsFile(ca, "CA certificate");
			}
			if (cert) {
				this._cert = await readTlsFile(cert, "client certificate");
			}
			if (key) {
				this._key = await readTlsFile(key, "client key");
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
