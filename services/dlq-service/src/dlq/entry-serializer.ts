import { createHash } from "node:crypto";

import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import type { DlqEntry } from "./repository";

export interface EntryHash {
	messageId: string;
	contentHash: string;
	serialized: string;
}

export class EntrySerializer {
	computeHash(entry: DlqEntry): EntryHash {
		const serialized = this._serialize(entry);
		const messageId = entry.messageId ?? this._sha256Hex(serialized);
		const contentHash = this._sha256Hex(serialized);
		return { messageId, contentHash, serialized };
	}

	private _serialize(entry: DlqEntry): string {
		return JSON.stringify({
			topic: entry.topic,
			message: entry.message,
			reason: entry.reason,
		});
	}

	private _sha256Hex(input: string): string {
		return createHash(CryptoAlg.SHA256).update(input).digest(CryptoAlg.HEX);
	}
}
