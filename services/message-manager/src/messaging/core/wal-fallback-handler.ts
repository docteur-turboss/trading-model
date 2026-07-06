import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { MESSAGES_DLQ_TOTAL } from "../../config/metrics";
import type { WalFlusherService } from "./wal-flusher-service";

export class WalFallbackHandler {
	constructor(private readonly _walFlusher: WalFlusherService) {}

	isPayloadTooLarge(topic: string, serialized: string): boolean {
		if (serialized.length <= ENV.MAX_PAYLOAD_BYTES) {
			return false;
		}
		logger.error("Message payload exceeds maximum size", {
			context: {
				topic,
				size: serialized.length,
				max: ENV.MAX_PAYLOAD_BYTES,
			},
		});
		MESSAGES_DLQ_TOTAL.inc({ topic, reason: "PAYLOAD_TOO_LARGE" });
		return true;
	}

	async storeInWal(
		topic: string,
		serialized: string,
		message: Message
	): Promise<string> {
		try {
			await this._walFlusher.storeInWal(topic, serialized);
		} catch (err) {
			logger.warn("Redis WAL list write failed, writing to in-memory buffer", {
				context: {
					topic,
					error: (err as Error).message,
				},
			});
			this._walFlusher.bufferInMemory(topic, serialized, message);
			return "memory-buffered";
		}

		this._walFlusher.flush().catch(() => {});
		return "wal-buffered";
	}
}
