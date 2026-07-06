import type { Message } from "@trading-model/common/contracts/message.types";

export interface MemoryWalEntry {
	topic: string;
	serialized: string;
	message: Message;
}
