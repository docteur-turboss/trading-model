import fs from "node:fs/promises";
import path from "node:path";

import { getNodeEnv, logger } from "@trading-model/common/config/logger";
import { decrypt, deriveKey, encrypt } from "./fallback-crypto";
import { FallbackFileReader } from "./fallback-file-reader";

const _ALGORITHM = "aes-256-gcm";
const _IV_LENGTH = 12;

export interface FsStore {
	readonly disabled: boolean;
	init(): Promise<void>;
	save(key: string, data: Record<string, unknown>): Promise<void>;
	get<TData>(key: string): Promise<TData | null>;
	getAll<TData>(): Promise<TData[]>;
	delete(key: string): Promise<void>;
}

export class NullFsStore implements FsStore {
	readonly disabled = true;

	async init(): Promise<void> {
		logger.warn("FsStore is DISABLED — no fallback storage available");
	}

	async save(_key: string, _data: Record<string, unknown>): Promise<void> {}

	async get<TData>(_key: string): Promise<TData | null> {
		return null;
	}

	async getAll<TData>(): Promise<TData[]> {
		return [];
	}

	async delete(_key: string): Promise<void> {}
}

class RealFsStore implements FsStore {
	readonly disabled = false;
	private readonly _baseDir: string;
	private _encryptionKey: Buffer | null;
	private readonly _fileReader: FallbackFileReader;

	constructor(options: { baseDir?: string; encryptionKey?: string }) {
		this._baseDir =
			options.baseDir ?? path.join(process.cwd(), "data", "ca-fallback");
		this._encryptionKey = this._initEncryptionKey(options.encryptionKey);
		this._fileReader = new FallbackFileReader(
			this._baseDir,
			this._encryptionKey
		);
	}

	private _initEncryptionKey(encryptionKey?: string): Buffer | null {
		if (encryptionKey) {
			return deriveKey(encryptionKey);
		}
		if (getNodeEnv() === "production") {
			throw new Error(
				"FsStore: FS_ENCRYPTION_KEY is required in production for encrypted fallback storage. " +
					"Generate with: node -e \"console.log(crypto.randomBytes(32).toString('base64'))\". " +
					"To disable the filesystem fallback entirely (relying solely on MongoDB), set CA_DISABLE_FS_FALLBACK=true. " +
					"Note: disabling FsStore means the CA will crash if MongoDB becomes unavailable."
			);
		}
		logger.warn(
			"FsStore: FS_ENCRYPTION_KEY not set — fallback data stored unencrypted. Acceptable for dev only."
		);
		return null;
	}

	async init(): Promise<void> {
		await fs.mkdir(this._baseDir, { recursive: true });
		logger.info("FsStore initialized", {
			context: {
				baseDir: this._baseDir,
				encrypted: this._encryptionKey !== null,
			},
		});
	}

	private _filePath(key: string): string {
		const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
		const ext = this._encryptionKey ? ".enc" : ".json";
		return path.join(this._baseDir, `${safe}${ext}`);
	}

	async save(key: string, data: Record<string, unknown>): Promise<void> {
		const fp = this._filePath(key);
		const tmp = `${fp}.tmp`;
		const serialized = JSON.stringify(data, null, 0);
		const payload = this._encryptionKey
			? encrypt(serialized, this._encryptionKey)
			: serialized;
		await fs.writeFile(tmp, payload, { mode: 0o600 });
		await fs.rename(tmp, fp);
	}

	async get<TData>(key: string): Promise<TData | null> {
		try {
			const fp = this._filePath(key);
			const raw = await fs.readFile(fp, "utf8");
			const decrypted = this._encryptionKey
				? decrypt(raw, this._encryptionKey)
				: raw;
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
		return new NullFsStore();
	}
	return new RealFsStore({
		baseDir: options?.baseDir,
		encryptionKey: options?.encryptionKey,
	});
}
