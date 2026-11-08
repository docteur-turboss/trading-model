import { sha256Hex } from "@trading-model/crypto/adapters/outbound/node-hash";
import type { DlqEntry } from "../adapters/outbound/repository";

export interface EntryHash {
	messageId: string;
	contentHash: string;
	serialized: string;
}

export class EntrySerializer {
	computeHash(entry: DlqEntry): EntryHash {
		const serialized = this._serialize(entry);
		const contentHash = sha256Hex(serialized);
		// Dedup key per (message, failed service): two subscribers failing on the
		// same message each keep their own replayable entry. Entries without
		// service keep the former key.
		const base = entry.messageId ?? contentHash;
		const messageId = entry.service ? `${base}:${entry.service}` : base;
		return { messageId, contentHash, serialized };
	}

	private _serialize(entry: DlqEntry): string {
		return JSON.stringify({
			topic: entry.topic,
			message: entry.message,
			reason: entry.reason,
			// Absent key when no service: hash of pre-existing entries unchanged.
			service: entry.service,
		});
	}
}
