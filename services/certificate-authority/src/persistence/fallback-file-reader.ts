import fs from "node:fs/promises";
import path from "node:path";

import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

export interface FileEncryption {
	readonly extension: string;
	serialize(plaintext: string): string;
	deserialize(ciphertext: string): string;
}

export class FallbackFileReader {
	constructor(
		private readonly _baseDir: string,
		private readonly _encryption: FileEncryption
	) {}

	async readAll<TData>(): Promise<TData[]> {
		try {
			const files = await fs.readdir(this._baseDir);
			return await this._readAllFiles<TData>(files);
		} catch {
			return [];
		}
	}

	private async _readAllFiles<TData>(files: string[]): Promise<TData[]> {
		const ext = this._encryption.extension;
		const results: TData[] = [];
		for (const file of files) {
			if (!file.endsWith(ext)) {
				continue;
			}
			const data = await this._tryReadFile<TData>(file);
			if (data !== undefined) {
				results.push(data);
			}
		}
		return results;
	}

	private async _tryReadFile<TData>(file: string): Promise<TData | undefined> {
		try {
			const raw = await fs.readFile(path.join(this._baseDir, file), "utf8");
			const decrypted = this._encryption.deserialize(raw);
			return JSON.parse(decrypted) as TData;
		} catch (err) {
			logger.warn("Skipping corrupted fallback file", {
				context: {
					file,
					err: normalizeError(err as Error),
				},
			});
		}
	}
}
