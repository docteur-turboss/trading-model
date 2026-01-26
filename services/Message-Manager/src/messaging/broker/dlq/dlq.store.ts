import { Message } from "../core/message";

export class DlqStore {
  private messages: Message[] = [];

  add(message: Message, reason: string) {
    this.messages.push({ ...message });
  }
}