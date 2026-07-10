import type { Message } from "@trading-model/common/contracts/message.types";
import type { Topic } from "@trading-model/common/domain/primitives";

export interface MemoryWalEntry {
	topic: Topic;
	serialized: string;
	message: Message;
}
