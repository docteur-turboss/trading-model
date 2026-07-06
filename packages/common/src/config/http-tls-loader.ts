import fs from "node:fs";

import type { TlsCredentials } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";

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

export class HttpTlsLoader {
	private _ca?: string;
	private _cert?: string;
	private _key?: string;
	private _tlsLoaded = false;
	private readonly _tlsConfig?: TlsCredentials;
	private _tlsLoadPromise: Promise<void> | null = null;

	constructor(tlsConfig?: TlsCredentials) {
		this._tlsConfig = tlsConfig;
	}

	async ensureLoaded(): Promise<void> {
		if (this._tlsLoaded || !this._tlsConfig) {
			return;
		}

		this._tlsLoadPromise ??= (async () => {
			if (!this._tlsConfig) {
				this._tlsLoaded = true;
				return;
			}
			const { ca, cert, key } = this._tlsConfig;
			if (ca) {
				this._ca = await readTlsFile(ca, "CA certificate");
			}
			if (cert) {
				this._cert = await readTlsFile(cert, "client certificate");
			}
			if (key) {
				this._key = await readTlsFile(key, "client key");
			}
			this._tlsLoaded = true;
		})();

		return await this._tlsLoadPromise;
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

	get hasTlsConfig(): boolean {
		return !!this._tlsConfig;
	}
}
