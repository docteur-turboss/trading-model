import { appendFile, readFile, rename, unlink } from "node:fs/promises";
import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import { MESSAGES_DLQ_ERROR_TOTAL } from "../../config/metrics";
import type { DeadLetterStorePort } from "../../domain/ports/dead-letter-store.port";

export type { DlqEntry };

/** What became of an entry handed over by `drain`. */
export enum DrainOutcome {
	/** Stored elsewhere: removed from the file. */
	Sent = "sent",
	/** Not stored, may succeed later: kept in the file. */
	Kept = "kept",
	/** Will never be accepted: moved to the `.rejected` file. */
	Rejected = "rejected",
}

export interface DrainResult {
	sent: number;
	kept: number;
	rejected: number;
}

/**
 * File-based Dead Letter Queue repository.
 *
 * Appends dead-lettered messages as JSON Lines (NDJSON) to a file.
 * Each line is a JSON-serialized DlqEntry.
 */
export class FileDlqRepository implements DeadLetterStorePort {
	private _draining = false;

	constructor(
		private readonly _filePath: string = "./dead-letter-queue.jsonl"
	) {}

	/**
	 * Persists a message to the Dead Letter Queue.
	 *
	 * @param entry - The entry to persist.
	 */
	async insert(entry: DlqEntry): Promise<void> {
		await this._appendLines([JSON.stringify(entry)]);
	}

	/**
	 * Hands every stored entry to `send` and keeps only those it could not
	 * store. The file is renamed first, so entries appended meanwhile land in a
	 * new file; a `.draining` file left by a crash is drained again. Lines that
	 * are not JSON go to the `.rejected` file with the rejected entries. The
	 * first entry kept stops the sending: the others are kept unsent.
	 */
	async drain(
		send: (entry: DlqEntry) => Promise<DrainOutcome>
	): Promise<DrainResult> {
		const result: DrainResult = { sent: 0, kept: 0, rejected: 0 };
		if (this._draining) {
			return result;
		}
		this._draining = true;
		try {
			const lines = await this._takeLines();
			const kept: string[] = [];
			const rejected: string[] = [];
			let unavailable = false;
			for (const line of lines) {
				// Once the target is down, sending the rest would only wait for
				// each to fail: keep them for the next drain.
				const outcome: DrainOutcome = unavailable
					? DrainOutcome.Kept
					: await this._drainLine(line, send);
				unavailable ||= outcome === DrainOutcome.Kept;
				result[outcome] += 1;
				if (outcome === DrainOutcome.Kept) {
					kept.push(line);
				} else if (outcome === DrainOutcome.Rejected) {
					rejected.push(line);
				}
			}
			await this._appendLines(kept);
			await this._appendLines(rejected, `${this._filePath}.rejected`);
			await unlink(this._drainingPath).catch(_ignoreMissing);
			return result;
		} finally {
			this._draining = false;
		}
	}

	/** Entries waiting in the file (not the rejected ones). */
	async count(): Promise<number> {
		return (await _readLines(this._filePath)).length;
	}

	private get _drainingPath(): string {
		return `${this._filePath}.draining`;
	}

	private async _takeLines(): Promise<string[]> {
		// A previous drain stopped half-way: its file still holds entries.
		const leftover = await _readLines(this._drainingPath);
		if (leftover.length > 0) {
			await this._appendLines(leftover);
		}
		await rename(this._filePath, this._drainingPath).catch(_ignoreMissing);
		return _readLines(this._drainingPath);
	}

	private _drainLine(
		line: string,
		send: (entry: DlqEntry) => Promise<DrainOutcome>
	): Promise<DrainOutcome> {
		const entry = _parseEntry(line);
		return entry ? send(entry) : Promise.resolve(DrainOutcome.Rejected);
	}

	private async _appendLines(
		lines: string[],
		path: string = this._filePath
	): Promise<void> {
		if (lines.length === 0) {
			return;
		}
		try {
			await appendFile(path, `${lines.join("\n")}\n`, "utf-8");
		} catch (err) {
			MESSAGES_DLQ_ERROR_TOTAL.inc({ target: "file" });
			throw err;
		}
	}
}

function _parseEntry(line: string): DlqEntry | null {
	// biome-ignore lint/plugin: a corrupt line is returned as null and moved to the .rejected file, not dropped
	try {
		return JSON.parse(line) as DlqEntry;
	} catch {
		return null;
	}
}

async function _readLines(path: string): Promise<string[]> {
	const content = await readFile(path, "utf-8").catch((err: unknown) => {
		_ignoreMissing(err);
		return "";
	});
	return content.split("\n").filter((line) => line.trim() !== "");
}

/** A missing file holds no entry; any other error is rethrown. */
function _ignoreMissing(err: unknown): void {
	if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
		throw err;
	}
}
