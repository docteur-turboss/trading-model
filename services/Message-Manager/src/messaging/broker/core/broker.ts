import { uuid } from "zod";
import { Dispatcher } from "./dispatcher";
import { message, MessageMetadata } from "./message";
import { MessageHandler } from "./subscription";

export class Broker {
  constructor(
    private readonly dispatcher: Dispatcher
  ) {}

  async publish(payload: unknown, metadata: Omit<MessageMetadata, "emittedAt"|"messageId">) {
    const Message: message = {
      metadata: {
        ...metadata,
        emittedAt: new Date(),
        messageId: String(uuid()),
      },
      payload
    }

    await this.dispatcher.dispatch(Message);
  }

  subscribe(topic: string, consumerGroup: string, onMessage: MessageHandler) {
    this.dispatcher.register(topic, consumerGroup, onMessage);
  }
}