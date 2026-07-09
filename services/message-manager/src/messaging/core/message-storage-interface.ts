import type { Message } from "@trading-model/common/contracts/message.types";

export interface IMessageStorage {
	store(topic: string, message: Message): Promise<string>;
}
