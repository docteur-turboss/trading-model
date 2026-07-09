import type { Message } from "@trading-model/common/contracts/message.types";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";

import { RedisStreamStore } from "./redis-stream-store";
import { WalFallbackHandler } from "./wal-fallback-handler";
import type { WalFlusherService } from "./wal-flusher-service";

export class PayloadSerializer {
	serialize(message: Message): string {
		return safeStringify(message);
	}
}

export class MessageStreamWriter {
	private readonly _streamStore: RedisStreamStore;
	private readonly _walFallback: WalFallbackHandler;
	private readonly _serializer: PayloadSerializer;

	constructor(
		private readonly _prefix: string,
		private readonly _walFlusher: WalFlusherService
	) {
		this._streamStore = new RedisStreamStore(this._prefix);
		this._walFallback = new WalFallbackHandler(this._walFlusher);
		this._serializer = new PayloadSerializer();
	}

	get streamStore(): RedisStreamStore {
		return this._streamStore;
	}

	get walFallback(): WalFallbackHandler {
		return this._walFallback;
	}

	get serializer(): PayloadSerializer {
		return this._serializer;
	}

	async store(topic: string, message: Message): Promise<string> {
		const serialized = this._serializer.serialize(message);

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
