import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(base64Key: string): Buffer {
	const key = Buffer.from(base64Key, "base64");
	if (key.length !== 32) {
		throw new Error(
			`FS_ENCRYPTION_KEY must be 32 bytes (got ${key.length}). Generate with: node -e "console.log(crypto.randomBytes(32).toString('base64'))"`
		);
	}
	return key;
}

function encrypt(plaintext: string, key: Buffer): string {
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(ciphertext: string, key: Buffer): string {
	const parts = ciphertext.split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted payload format");
	}
	const iv = Buffer.from(parts[0], "base64");
	if (iv.length !== 12 && iv.length !== 16) {
		throw new Error(
			`Invalid IV length: ${iv.length} bytes (expected 12 or 16)`
		);
	}
	const tag = Buffer.from(parts[1], "base64");
	const encrypted = Buffer.from(parts[2], "base64");
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([
		decipher.update(encrypted),
		decipher.final(),
	]);
	return decrypted.toString("utf8");
}

export class FsStore {
	readonly disabled: boolean;
	private readonly _baseDir: string;
	private readonly _encryptionKey: Buffer | null;

	constructor(options?: {
		baseDir?: string;
		encryptionKey?: string;
		disableFallback?: boolean;
	}) {
		this._baseDir =
			options?.baseDir ?? path.join(process.cwd(), "data", "ca-fallback");
		this.disabled = options?.disableFallback ?? false;

		if (this.disabled) {
			this._encryptionKey = null;
			logger.warn("FsStore is DISABLED — no fallback storage available", {
				context: {
					baseDir: this._baseDir,
				},
			});
		} else if (options?.encryptionKey) {
			this._encryptionKey = deriveKey(options.encryptionKey);
		} else if (process.env.NODE_ENV === "production") {
			throw new Error(
				"FsStore: FS_ENCRYPTION_KEY is required in production for encrypted fallback storage. " +
					"Generate with: node -e \"console.log(crypto.randomBytes(32).toString('base64'))\". " +
					"To disable the filesystem fallback entirely (relying solely on MongoDB), set CA_DISABLE_FS_FALLBACK=true. " +
					"Note: disabling FsStore means the CA will crash if MongoDB becomes unavailable."
			);
		} else {
			this._encryptionKey = null;
			logger.warn(
				"FsStore: FS_ENCRYPTION_KEY not set — fallback data stored unencrypted. Acceptable for dev only."
			);
		}
	}

	async init(): Promise<void> {
		if (this.disabled) {
			return;
		}
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
		if (this.disabled) {
			throw new Error("FsStore is disabled — cannot write fallback data");
		}
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
		if (this.disabled) {
			return null;
		}
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
		if (this.disabled) {
			return [];
		}
		try {
			const files = await fs.readdir(this._baseDir);
			return await this._readAllFiles<TData>(files);
		} catch {
			return [];
		}
	}

	private async _readAllFiles<TData>(files: string[]): Promise<TData[]> {
		const ext = this._encryptionKey ? ".enc" : ".json";
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
			const decrypted = this._encryptionKey
				? decrypt(raw, this._encryptionKey)
				: raw;
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

	async delete(key: string): Promise<void> {
		if (this.disabled) {
			return;
		}
		try {
			await fs.unlink(this._filePath(key));
		} catch {
			// ignore if already gone
		}
	}
}
