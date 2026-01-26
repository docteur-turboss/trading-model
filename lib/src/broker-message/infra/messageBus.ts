import { InternalBrokerAdapter, MessageBus, MessageHandler, MessageType, PublisherType, PublishOptions } from "../shared/types/messageBus";

/**
 * TODO
 */


/**
 * TODO
 */
export class DefaultMessageBus implements MessageBus {
    constructor(
        private readonly config: PublisherType,
        private readonly broker: InternalBrokerAdapter
    ) {}

    async publish<T>(
        message: MessageType<T>, 
        options?: PublishOptions
    ): Promise<void> {
        const erichedMessage: MessageType<T> = {
            ...message,
            metadata: {
                ...message.metadata,
                topic: options?.topic ?? message.metadata.topic,
                publisher: {
                    serviceName: this.config.serviceName,
                    instanceId: this.config.instanceId
                },
                routing: {
                    ...message.metadata.routing,
                    partitionKey: options?.partitionKey,
                    priority: options?.priority
                }
            }
        }

        await this.broker.publish(erichedMessage);
    }

    async subscribe<T>(
        topic: string, 
        consumerGroup: string, 
        handler: MessageHandler<T>
    ): Promise<void> {
        await this.broker.subscribe(
            topic,
            consumerGroup,
            async (message, context) => {
                try{
                    await handler(message as MessageType<T>, context);
                }catch (error) {
                    await context.nack(
                        error instanceof Error ? error.message : "Unhandled error"
                    );
                }
            }
        )    
    }

    async close(): Promise<void> {
        await this.broker.close();
    }
}