import type { Message } from "@trading-model/common/contracts/message.types";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";

import { logger } from "../../config/logger";
import type { MemoryWalBuffer } from "./memory-wal-buffer";

export interface ParsedWalEntry {
	topic: string;
	data: string;
}

export interface ParsedEntry {
	topic: string;
	data: string;
}

export class WalEntryParser {
	private readonly _memoryWalBuffer: MemoryWalBuffer;

	constructor(memoryWalBuffer: MemoryWalBuffer) {
		this._memoryWalBuffer = memoryWalBuffer;
	}

	drainEntry(entry: string): ParsedEntry | null {
		try {
			const parsed = JSON.parse(entry) as {
				topic: string;
				serialized?: string;
				message?: Message;
			};
			return {
				topic: parsed.topic,
				data: parsed.serialized ?? safeStringify(parsed.message!),
			};
		} catch {
			logger.warn("WAL flush: malformed entry dropped", {
				context: {
					entry: entry.substring(0, 200),
				},
			});
			return null;
		}
	}

	parseAndBuffer(raw: string[]): void {
		for (const entry of raw) {
			try {
				const parsed = JSON.parse(entry) as {
					topic: string;
					serialized?: string;
					message?: Message;
				};
				const topic = parsed.topic;
				const serialized = parsed.serialized ?? safeStringify(parsed.message!);
				const message = parsed.message ?? JSON.parse(parsed.serialized!);
				this._memoryWalBuffer.push(topic, serialized, message);
			} catch {
				// best-effort
			}
		}
	}

	static parse(entry: string): ParsedWalEntry | null {
		try {
			return _parseEntry(entry);
		} catch {
			logger.warn("WAL flush: malformed entry dropped", {
				context: {
					entry: entry.substring(0, 200),
				},
			});
			return null;
		}
	}

	static parseWithMessage(
		entry: string
	): { topic: string; serialized: string; message: unknown } | null {
		try {
			const parsed = JSON.parse(entry) as {
				topic: string;
				serialized?: string;
				message?: unknown;
			};
			const topic = parsed.topic;
			const serialized = parsed.serialized ?? JSON.stringify(parsed.message);
			const message = parsed.message ?? JSON.parse(parsed.serialized!);
			return { topic, serialized, message };
		} catch {
			return null;
		}
	}
}

function _parseEntry(entry: string): ParsedWalEntry {
	const parsed = JSON.parse(entry) as {
		topic: string;
		serialized?: string;
		message?: Record<string, unknown>;
	};
	return {
		topic: parsed.topic,
		data: parsed.serialized ?? JSON.stringify(parsed.message!),
	};
}
