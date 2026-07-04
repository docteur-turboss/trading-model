import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

import { generateKeyPairWithId, KeyAlgorithm } from "./generate-key-pair";
import type { KeyPair, KeyPairWithId } from "./types";

export interface KeyVault {
	generate(algorithm?: KeyAlgorithm): Promise<KeyPairWithId>;
	read(keyPath: string): Promise<KeyPair>;
	write(
		keyPath: string,
		keyPair: KeyPair,
		options?: { mode?: number }
	): Promise<void>;
	exists(keyPath: string): Promise<boolean>;
}

export class FileKeyVault implements KeyVault {
	async generate(
		algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
	): Promise<KeyPairWithId> {
		return await generateKeyPairWithId(algorithm);
	}

	async read(keyPath: string): Promise<KeyPair> {
		const privateKey = await readFile(keyPath, "utf8");
		return { publicKey: "", privateKey };
	}

	async write(
		keyPath: string,
		keyPair: KeyPair,
		options?: { mode?: number }
	): Promise<void> {
		const dir = keyPath.substring(0, keyPath.lastIndexOf("/"));
		await mkdir(dir, { recursive: true });
		await writeFile(keyPath, keyPair.privateKey, {
			mode: options?.mode ?? 0o600,
		});
	}

	async exists(keyPath: string): Promise<boolean> {
		try {
			await access(keyPath, constants.R_OK);
			return true;
		} catch (err) {
			logger.warn("Key file existence check failed", {
				keyPath,
				err: normalizeError(err),
			});
			return false;
		}
	}
}
