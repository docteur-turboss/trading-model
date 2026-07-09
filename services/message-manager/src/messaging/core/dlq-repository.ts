import { appendFile } from "node:fs/promises";

import type { DlqEntry } from "@trading-model/common/contracts/dlq.types";

export type { DlqEntry };

/**
 * File-based Dead Letter Queue repository.
 *
 * Appends dead-lettered messages as JSON Lines (NDJSON) to a file.
 * Each line is a JSON-serialized DlqEntry.
 */
export class FileDlqRepository {
	constructor(
		private readonly _filePath: string = "./dead-letter-queue.jsonl"
	) {}

	/**
	 * Persists a message to the Dead Letter Queue.
	 *
	 * @param entry - The entry to persist.
	 */
	async insert(entry: DlqEntry): Promise<void> {
		await appendFile(this._filePath, `${JSON.stringify(entry)}\n`, "utf-8");
	}
}
