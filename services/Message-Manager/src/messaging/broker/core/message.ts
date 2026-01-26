import { DeliveryMode } from "../broker.constants";
import { IdentifyType } from "../broker.interface";

export interface message <T = unknown> {
  metadata : MessageMetadata
  payload: T;                         /* Business data carried by the message         */
}

export interface MessageMetadata {
    correlationId?: string;        /* Links multiple messages of the same flow     */
    schemaVersion: string;          /* Payload contract version                     */
    causationId?: string;           /* Identifies the message that caused this one  */
    messageId: string;             /* Unique message id (UUID, ULID)               */
    eventType: string;              /* Business event name (e.g. UserCreated)       */
    emittedAt: Date;                /* ISO timestamp when message was produced      */
    topic: string;                  /* Logical routing channel                      */

    publisher: IdentifyType;

    routing?: {
      partitionKey?: string;      /* Ensures ordering for a given business key    */
      priority?: number;          /* Influences delivery scheduling               */
    }

    delivery?: {
      mode: DeliveryMode;         /* Influences delivery scheduling */
      ttl?: number;               /* Message expiration in milliseconds           */
      deduplicationId?: string;   /* Prevents processing duplicates               */
    }

    security?: {
      authContext?: unknown;      /* Authentication / authorization context       */
      signature?: string;         /* Message integrity verification               */
    }
  }



/**
 * TODO
 */
export interface PublishOptions {
    topic?: string;
    priority?: number;
    partitionKey?: string;
}