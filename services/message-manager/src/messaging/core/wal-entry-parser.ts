import { logger } from "../../config/logger";

export interface ParsedWalEntry {
	topic: string;
	data: string;
}

export class WalEntryParser {
	static parse(entry: string): ParsedWalEntry | null {
		try {
			const parsed = JSON.parse(entry) as {
				topic: string;
				serialized?: string;
				message?: Record<string, unknown>;
			};
			return {
				topic: parsed.topic,
				data: parsed.serialized ?? JSON.stringify(parsed.message!),
			};
		} catch {
			logger.warn("WAL flush: malformed entry dropped", { context: {
				entry: entry.substring(0, 200),
			} });
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
