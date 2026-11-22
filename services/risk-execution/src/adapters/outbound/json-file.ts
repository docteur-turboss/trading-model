import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { StatePort } from "../../domain/ports";

/** One JSON document on a PVC, replaced atomically and durably (tmp file fsynced, rename, directory fsynced). */
export class JsonFile<Doc> implements StatePort<Doc> {
	constructor(private readonly _path: string) {}

	async load(): Promise<Doc | null> {
		let text: string;
		try {
			text = await readFile(this._path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return null;
			}
			throw error;
		}
		return JSON.parse(text) as Doc;
	}

	async save(state: Doc): Promise<void> {
		await mkdir(dirname(this._path), { recursive: true });
		const tmp = `${this._path}.tmp-${randomUUID()}`;
		const file = await open(tmp, "w");
		try {
			await file.writeFile(JSON.stringify(state));
			await file.sync();
		} finally {
			await file.close();
		}
		await rename(tmp, this._path);
		await this._syncDirectory();
	}

	/** Makes the rename durable; platforms that refuse to open or sync a directory (Windows) are skipped. */
	private async _syncDirectory(): Promise<void> {
		try {
			const dir = await open(dirname(this._path), "r");
			try {
				await dir.sync();
			} finally {
				await dir.close();
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EISDIR" && code !== "EPERM") {
				throw error;
			}
		}
	}
}
