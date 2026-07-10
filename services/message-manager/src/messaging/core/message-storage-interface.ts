import type { Message } from "@trading-model/common/contracts/message.types";
import type { Topic } from "@trading-model/common/domain/primitives";

export interface IMessageStorage {
	store(topic: Topic, message: Message): Promise<string>;
}
