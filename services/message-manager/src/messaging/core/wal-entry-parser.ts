import type { Topic } from "@trading-model/common/domain/primitives";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";
import type { Message } from "@trading-model/validation/contracts/message.types";

import { logger } from "../../config/logger";
import type { MemoryWalBuffer } from "./memory-wal-buffer";
import type { MemoryWalEntry } from "./memory-wal-entry";

export interface ParsedWalEntry {
	topic: Topic;
	data: string;
}

export interface ParsedEntry {
	topic: Topic;
	data: string;
}

export class WalEntryParser {
	private readonly _memoryWalBuffer: MemoryWalBuffer;

	constructor(memoryWalBuffer: MemoryWalBuffer) {
		this._memoryWalBuffer = memoryWalBuffer;
	}

	drainEntry(entry: string): ParsedEntry | null {
		try {
			return this._tryParseDrainEntry(entry);
		} catch {
			return this._logMalformedEntry(entry);
		}
	}

	private _tryParseDrainEntry(entry: string): ParsedEntry {
		const parsed = JSON.parse(entry) as {
			topic: Topic;
			serialized?: string;
			message?: Message;
		};
		return {
			topic: parsed.topic,
			data: parsed.serialized ?? safeStringify(parsed.message!),
		};
	}

	private _logMalformedEntry(entry: string): null {
		logger.warn("WAL flush: malformed entry dropped", {
			context: {
				entry: entry.substring(0, 200),
			},
		});
		return null;
	}

	parseAndBuffer(raw: string[]): void {
		for (const entry of raw) {
			this._tryParseAndBuffer(entry);
		}
	}

	private _tryParseAndBuffer(entry: string): void {
		try {
			const walEntry = this._buildWalEntry(entry);
			void this._memoryWalBuffer.push(walEntry);
		} catch {
			logger.debug("WAL entry parse failed (best-effort)");
		}
	}

	private _buildWalEntry(entry: string): MemoryWalEntry {
		const parsed = JSON.parse(entry) as {
			topic: Topic;
			serialized?: string;
			message?: unknown;
		};
		const topic = parsed.topic;
		const serialized = parsed.serialized ?? safeStringify(parsed.message!);
		const message = parsed.message ?? JSON.parse(parsed.serialized!);
		return {
			topic,
			serialized,
			message: message as Message,
		};
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

	static parseWithMessage(entry: string): MemoryWalEntry | null {
		try {
			const parsed = JSON.parse(entry) as {
				topic: Topic;
				serialized?: string;
				message?: unknown;
			};
			const topic = parsed.topic;
			const serialized = parsed.serialized ?? JSON.stringify(parsed.message);
			const message = parsed.message ?? JSON.parse(parsed.serialized!);
			return { topic, serialized, message: message as Message };
		} catch {
			return null;
		}
	}
}

function _parseEntry(entry: string): ParsedWalEntry {
	const parsed = JSON.parse(entry) as {
		topic: Topic;
		serialized?: string;
		message?: Record<string, unknown>;
	};
	return {
		topic: parsed.topic,
		data: parsed.serialized ?? JSON.stringify(parsed.message!),
	};
}
