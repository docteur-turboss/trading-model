import { HttpClient } from '@trading-model/common/config/http-client';
import { Message } from '@trading-model/common/contracts/message.types';

import { DqlRepository } from './dlq-repository';
import { MessageDeliveryContext, MessageDeliveryPort } from './message-delivery-port';

export class HttpMessageDelivery implements MessageDeliveryPort {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly dqlRepository: DqlRepository
  ) {}

  async send(url: string, message: Message, context: MessageDeliveryContext): Promise<void> {
    await this.httpClient.post(url, { message, context });
  }

  async markDeadLetter(message: Message, reason: string, deliveryAttempt: number): Promise<void> {
    await this.dqlRepository.add({
      message,
      reason,
      deliveryAttempt,
      timestamp: new Date().toISOString(),
    });
  }
}
