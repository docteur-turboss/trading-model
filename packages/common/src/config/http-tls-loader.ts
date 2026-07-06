import fs from "node:fs";

import type { TlsPemBundle } from "../domain/tls-paths";
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

export class HttpTlsLoader {
	readonly ca: string | undefined;
	readonly cert: string | undefined;
	readonly key: string | undefined;

	constructor(tlsConfig?: Partial<TlsPemBundle>) {
		if (!tlsConfig) {
			return;
		}
		if (tlsConfig.ca) {
			this.ca = readTlsFileSync(tlsConfig.ca, "CA certificate");
		}
		if (tlsConfig.cert) {
			this.cert = readTlsFileSync(tlsConfig.cert, "client certificate");
		}
		if (tlsConfig.key) {
			this.key = readTlsFileSync(tlsConfig.key, "client key");
		}
	}

	get hasTlsConfig(): boolean {
		return Boolean(this.ca || this.cert || this.key);
	}
}
