import { ENV } from "../../config/env";
import type { MemoryWalEntry } from "./memory-wal-entry";

export class FallbackFileRecovery {
	async recover(): Promise<MemoryWalEntry[]> {
		try {
			const fs = await import("node:fs/promises");
			const content = await this._readFallbackFile(fs);
			if (!content) {
				return [];
			}
			return await this._processRecoveredContent(fs, content);
		} catch {
			return [];
		}
	}

	private async _readFallbackFile(
		fs: typeof import("node:fs/promises")
	): Promise<string | null> {
		try {
			return await fs.readFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "utf-8");
		} catch {
			return null;
		}
	}

	private async _processRecoveredContent(
		fs: typeof import("node:fs/promises"),
		content: string
	): Promise<MemoryWalEntry[]> {
		const { walEntries, remaining } = this._parseFallbackLines(content);
		await this._writeRemainingLines(fs, remaining);
		return walEntries;
	}

	private _parseFallbackLines(content: string): {
		walEntries: MemoryWalEntry[];
		remaining: string[];
	} {
		const lines = content.split("\n").filter(Boolean);
		const walEntries: MemoryWalEntry[] = [];
		const remaining: string[] = [];
		for (const line of lines) {
			this._classifyLine(line, walEntries, remaining);
		}
		return { walEntries, remaining };
	}

	private _classifyLine(
		line: string,
		walEntries: MemoryWalEntry[],
		remaining: string[]
	): void {
		try {
			const parsed = JSON.parse(line);
			if (this._isValidWalEntry(parsed)) {
				walEntries.push(parsed as MemoryWalEntry);
			} else {
				remaining.push(line);
			}
		} catch {
			remaining.push(line);
		}
	}

	private _isValidWalEntry(parsed: Record<string, unknown>): boolean {
		return !!(parsed?.topic && parsed.message && parsed.deliveryAttempt === undefined);
	}

	private async _writeRemainingLines(
		fs: typeof import("node:fs/promises"),
		remaining: string[]
	): Promise<void> {
		if (remaining.length > 0) {
			await fs.writeFile(
				ENV.DLQ_LOCAL_FALLBACK_PATH,
				`${remaining.join("\n")}\n`,
				"utf-8"
			);
		} else {
			await fs.writeFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "", "utf-8");
		}
	}
}
