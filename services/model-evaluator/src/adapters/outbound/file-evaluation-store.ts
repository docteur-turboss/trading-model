import { randomUUID } from "node:crypto";
import { link, mkdir, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { EvaluationRecord } from "../../domain/model-evaluation";

/** Evaluation records as files, one per `(symbol, version)`, on a PVC. */
export class FileEvaluationStore {
	constructor(private readonly _dir: string) {}

	private _file(symbol: string, version: string): string {
		return join(this._dir, symbol, `${version}.json`);
	}

	async has(symbol: string, version: string): Promise<boolean> {
		try {
			await stat(this._file(symbol, version));
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return false;
			}
			throw error;
		}
	}

	/**
	 * Exclusive and atomic: written to a `.tmp-` file, then published by `link`
	 * (`EEXIST` gives `false`), so a crash never leaves a truncated record and a
	 * redelivery never overwrites.
	 */
	async create(record: EvaluationRecord): Promise<boolean> {
		await mkdir(join(this._dir, record.symbol), { recursive: true });
		const tmp = join(
			this._dir,
			record.symbol,
			`.tmp-${process.pid}-${randomUUID()}`
		);
		try {
			const file = await open(tmp, "wx");
			try {
				await file.writeFile(`${JSON.stringify(record, null, 2)}\n`);
				await file.sync();
			} finally {
				await file.close();
			}
			await link(tmp, this._file(record.symbol, record.version));
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") {
				return false;
			}
			throw error;
		} finally {
			await rm(tmp, { force: true });
		}
	}
}
