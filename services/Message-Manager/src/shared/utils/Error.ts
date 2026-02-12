/**
 * @file errors.ts
 * 
 * @description
 * This module defines **custom error types** used throughout the broker system
 * to signal specific failure scenarios during message delivery and processing.
 * 
 * @responsability
 * - Represent timeouts, recoverable failures, and unrecoverable failures (DLQ)
 * - Provide structured error information for downstream handlers
 * 
 * @restrictions
 * - These errors are **domain-specific**; they are not generic application errors
 * - They are meant to be caught and interpreted by broker delivery logic
 * 
 * @architecture
 * Part of the **infrastructure layer** for message delivery.
 * They are used by Dispatcher, Subscription, and broker route handlers
 * to enforce delivery semantics.
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.28
 */

/**
 * TimeoutError
 * 
 * @description
 * Represents a **timeout scenario** during message delivery or broker operations.
 * Typically used when an HTTP request to a subscriber exceeds its allowed time window.
 */
export class TimeoutError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'TimeoutError'
    }
}

/**
 * NackError
 * 
 * @description
 * Signals a **recoverable failure** during message delivery.
 * The broker may retry delivery according to the delivery mode (AT_LEAST_ONCE).
 * 
 * @param {string} [reason] Optional textual reason for the failure
 */
export class NackError extends Error {
    constructor(public readonly reason?: string) {
        super(reason);
        this.name = 'NackError';
    }
}

/**
 * DeadLetterError
 * 
 * @description
 * Signals an **unrecoverable failure**, causing the message to be routed
 * to the Dead Letter Queue (DLQ).
 * 
 * @param {string} [reason] Optional textual reason for DLQ routing
 */
export class DeadLetterError extends Error {
    constructor(public readonly reason?: string) {
        super(reason);
        this.name = 'DeadLetterError';
    }
}
