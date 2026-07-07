import { appendFile } from "node:fs/promises";

import type { UnixTimestamp } from "@trading-model/common/domain/primitives";

/** Single entry written to the Dead Letter Queue. */
export interface DlqEntry {
	/** The failed message payload and metadata. */
	message: unknown;

	/** Human-readable reason for the failure. */
	reason?: string;

	/** Number of delivery attempts made before the message was dead-lettered. */
	deliveryAttempt: number;

	/** ISO-8601 timestamp when the entry was created. */
	timestamp: UnixTimestamp;
}

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
