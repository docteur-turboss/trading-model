import type { Topic } from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";

export interface MemoryWalEntry {
	topic: Topic;
	serialized: string;
	message: Message;
}
