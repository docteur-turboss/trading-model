import type { Topic } from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/contracts/message.types";

export interface IMessageStorage {
	store(topic: Topic, message: Message): Promise<string>;
}
