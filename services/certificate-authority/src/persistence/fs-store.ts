import fs from "node:fs/promises";
import path from "node:path";

import { logger } from "@trading-model/common/config/logger";
import { FallbackFileReader, type FileEncryption } from "./fallback-file-reader";
import { AesEncryption, buildEncryption, NOOP_ENCRYPTION } from "./encryption-strategies";

export { AesEncryption, NOOP_ENCRYPTION };

export interface FsStore {
	readonly disabled: boolean;
	init(): Promise<void>;
	save(key: string, data: Record<string, unknown>): Promise<void>;
	get<TData>(key: string): Promise<TData | null>;
	getAll<TData>(): Promise<TData[]>;
	delete(key: string): Promise<void>;
}

export const NULL_FS_STORE: FsStore = {
	disabled: true,
	init: async () => {
		logger.warn("FsStore is DISABLED — no fallback storage available");
	},
	save: async () => {},
	get: async () => null,
	getAll: async () => [],
	delete: async () => {},
};

class RealFsStore implements FsStore {
	readonly disabled = false;
	private readonly _baseDir: string;
	private readonly _encryption: FileEncryption;
	private readonly _fileReader: FallbackFileReader;

	constructor(options: { baseDir?: string; encryption?: FileEncryption }) {
		this._baseDir =
			options.baseDir ?? path.join(process.cwd(), "data", "ca-fallback");
		this._encryption = options.encryption ?? NOOP_ENCRYPTION;
		this._fileReader = new FallbackFileReader(this._baseDir, this._encryption);
	}

	async init(): Promise<void> {
		await fs.mkdir(this._baseDir, { recursive: true });
		logger.info("FsStore initialized", {
			context: {
				baseDir: this._baseDir,
				encrypted: this._encryption instanceof AesEncryption,
			},
		});
	}

	private _filePath(key: string): string {
		const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
		return path.join(this._baseDir, `${safe}${this._encryption.extension}`);
	}

	async save(key: string, data: Record<string, unknown>): Promise<void> {
		const fp = this._filePath(key);
		const tmp = `${fp}.tmp`;
		const serialized = JSON.stringify(data, null, 0);
		const payload = this._encryption.serialize(serialized);
		await fs.writeFile(tmp, payload, { mode: 0o600 });
		await fs.rename(tmp, fp);
	}

	async get<TData>(key: string): Promise<TData | null> {
		try {
			const fp = this._filePath(key);
			const raw = await fs.readFile(fp, "utf8");
			const decrypted = this._encryption.deserialize(raw);
			return JSON.parse(decrypted) as TData;
		} catch {
			return null;
		}
	}

	async getAll<TData>(): Promise<TData[]> {
		return this._fileReader.readAll<TData>();
	}

	async delete(key: string): Promise<void> {
		try {
			await fs.unlink(this._filePath(key));
		} catch {
			logger.debug("File already deleted");
		}
	}
}

export function createFsStore(options?: {
	baseDir?: string;
	encryptionKey?: string;
	disableFallback?: boolean;
}): FsStore {
	if (options?.disableFallback) {
		return NULL_FS_STORE;
	}
	return new RealFsStore({
		baseDir: options?.baseDir,
		encryption: buildEncryption(options?.encryptionKey),
	});
}
