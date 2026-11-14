import { mkdir, stat, writeFile } from "node:fs/promises";
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

	/** Exclusive create (`wx`): `false` when a record exists, so a redelivery never overwrites. */
	async create(record: EvaluationRecord): Promise<boolean> {
		await mkdir(join(this._dir, record.symbol), { recursive: true });
		try {
			await writeFile(
				this._file(record.symbol, record.version),
				`${JSON.stringify(record, null, 2)}\n`,
				{ flag: "wx" }
			);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") {
				return false;
			}
			throw error;
		}
	}
}
