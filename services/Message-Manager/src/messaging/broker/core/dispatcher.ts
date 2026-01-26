import { message } from "./message";
import { MessageHandler } from "./subscription";

export class Dispatcher {
  private subscribers = new Map<string, MessageHandler[]>();

  register(topic: string, consumerGroup: string, handler: MessageHandler) {
    const subs = this.subscribers.get(topic) ?? [];
    subs.push(handler);
    this.subscribers.set(topic, subs);
  }

  async dispatch(message: message) {
    
  }
}