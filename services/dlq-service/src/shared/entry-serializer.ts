import { sha256Hex } from "@trading-model/crypto/domain/services/hash-utils";
import type { DlqEntry } from "../adapters/outbound/repository";

export interface EntryHash {
	messageId: string;
	contentHash: string;
	serialized: string;
}

export class EntrySerializer {
	computeHash(entry: DlqEntry): EntryHash {
		const serialized = this._serialize(entry);
		const messageId = entry.messageId ?? sha256Hex(serialized);
		const contentHash = sha256Hex(serialized);
		return { messageId, contentHash, serialized };
	}

	private _serialize(entry: DlqEntry): string {
		return JSON.stringify({
			topic: entry.topic,
			message: entry.message,
			reason: entry.reason,
		});
	}
}
