import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StatePort } from "../../domain/ports";

/** One JSON document on a PVC, replaced atomically (tmp file then rename). */
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
		await writeFile(tmp, JSON.stringify(state));
		await rename(tmp, this._path);
	}
}
