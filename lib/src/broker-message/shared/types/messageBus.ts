import { ServiceInstanceName } from "config/services.types";

export interface SubscribersContext {
  receivedAt: Date;                           /* Timestamp when message was delivered   */
  deliveryAttempt: number;                    /* Current retry attempt number           */
  consumerGroup: string;                      /* Consumer group identifier              */
  ack(): Promise<void>;                       /* Confirms successful processing         */
  nack(reason?: string): Promise<void>;       /* Signals processing failure             */
  requeue(delayMs?: number): Promise<void>;   /* Requests delayed retry                 */
  deadLetter(reason?: string): Promise<void>; /* Sends message to DLQ                   */
}

export interface MessageType <T = unknown> {
    metadata : {
        correlationId?: string;        /* Links multiple messages of the same flow     */
        schemaVersion: string;          /* Payload contract version                     */
        causationId?: string;           /* Identifies the message that caused this one  */
        messageId: string;             /* Unique message id (UUID, ULID)               */
        eventType: string;              /* Business event name (e.g. UserCreated)       */
        emittedAt: Date;                /* ISO timestamp when message was produced      */
        topic: string;                  /* Logical routing channel                      */

        publisher: PublisherType;

        routing?: {
            partitionKey?: string;      /* Ensures ordering for a given business key    */
            priority?: number;          /* Influences delivery scheduling               */
        }

        delivery?: {
            mode: 'at-most-once' | 'at-least-once' | "exactly-once";    /* Influences delivery scheduling */
            ttl?: number;               /* Message expiration in milliseconds           */
            deduplicationId?: string;   /* Prevents processing duplicates               */
        }

        security?: {
            authContext?: unknown;      /* Authentication / authorization context       */
            signature?: string;         /* Message integrity verification               */
        }
    }

    payload: T;                         /* Business data carried by the message         */
}

export interface PublisherType {
    serviceName: keyof typeof ServiceInstanceName; /* Logical name of the emitting service       */
    instanceId: string;                            /* Unique instance identifier (pod/container) */
}

/**
 * TODO
 */
export type MessageHandler<T = unknown> = (
    message: MessageType<T>,
    context: SubscribersContext
) => Promise<void>;

/**
 * TODO
 */
export interface PublishOptions {
    topic?: string;
    priority?: number;
    partitionKey?: string;
}


/**
 * TODO
 */
export interface MessageBus {
    /**
     * TODO
     * @param message 
     * @param options 
     */
    publish<T>(
        message: MessageType<T>,
        options?: PublishOptions
    ): Promise<void>;

    /**
     * TODO
     *
     * @param topic - Logical topic name
     * @param consumerGroup - Consumer group identifier
     * @param handler - Message processing function
     */
    subscribe<T>(
        topic: string,
        consumerGroup: string,
        handler: MessageHandler<T>
    ): Promise<void>

    /**
     * TODO
     */
    close(): Promise<void>
}

/**
 * TODO
 */
export interface InternalBrokerAdapter {

  publish(message: MessageType): Promise<void>

  subscribe(
    topic: string,
    consumerGroup: string,
    onMessage: (
      message: MessageType,
      context: SubscribersContext
    ) => Promise<void>
  ): Promise<void>

  close(): Promise<void>
}