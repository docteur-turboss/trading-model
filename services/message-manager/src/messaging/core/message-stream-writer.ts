import type { Message } from "@trading-model/common/contracts/message.types";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";

import { RedisStreamStore } from "./redis-stream-store";
import { WalFallbackHandler } from "./wal-fallback-handler";
import type { WalFlusherService } from "./wal-flusher-service";

export class MessageStreamWriter {
	private readonly _streamStore: RedisStreamStore;
	private readonly _walFallback: WalFallbackHandler;

	constructor(
		private readonly _prefix: string,
		private readonly _walFlusher: WalFlusherService
	) {
		this._streamStore = new RedisStreamStore(this._prefix);
		this._walFallback = new WalFallbackHandler(this._walFlusher);
	}

	async store(topic: string, message: Message): Promise<string> {
		const serialized = safeStringify(message);

		if (this._walFallback.isPayloadTooLarge(topic, serialized)) {
			return "payload-too-large";
		}

		const entryId = await this._streamStore.store(topic, serialized);
		if (entryId !== null) {
			return entryId;
		}

		return this._walFallback.storeInWal({ topic, serialized, message });
	}
}
