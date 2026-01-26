import { Broker } from "messaging/broker/core/broker";
import { Transport } from "../transport.interface";

export class LocalTransport implements Transport {
  constructor(private broker: Broker) {}

  async send(topic: string, message: unknown) {
    await this.broker.publish(topic, {
      id: crypto.randomUUID(),
      payload: message,
      timestamp: Date.now()
    });
  }

  async start() {}
}