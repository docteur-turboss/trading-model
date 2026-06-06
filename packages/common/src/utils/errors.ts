/** Base error class for all domain-specific errors in the trading model. */
export abstract class TradingModelError extends Error {
  public readonly cause?: unknown;

  /**
   * @param message - Human-readable error description.
   * @param cause - Optional underlying cause of the error.
   */
  protected constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Base class for address / service-discovery related errors. */
export abstract class AddressManagerBaseError extends TradingModelError {
  protected constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Thrown when a requested service cannot be found in the registry. */
export class ServiceNotFoundError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Thrown when a service is known but cannot be reached. */
export class ServiceUnreachableError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Thrown when authentication with a service or registry fails. */
export class AuthenticationError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Generic error for address manager failures. */
export class AddressManagerError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Base class for message bus / queue related errors. */
export abstract class MessageManagerBaseError extends TradingModelError {
  protected constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Generic error for message manager failures. */
export class MessageManagerError extends MessageManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Thrown when message metadata construction fails. */
export class MetadataBuilderError extends MessageManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Thrown when a message operation exceeds its allowed timeout. */
export class TimeoutError extends MessageManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Thrown when a message is negatively acknowledged by the consumer. */
export class NackError extends MessageManagerBaseError {
  constructor(
    public readonly reason?: string,
    cause?: unknown
  ) {
    super(reason ?? 'Message negatively acknowledged', cause);
  }
}

/** Thrown when a message is routed to the dead-letter queue. */
export class DeadLetterError extends MessageManagerBaseError {
  constructor(
    public readonly reason?: string,
    cause?: unknown
  ) {
    super(reason ?? 'Message sent to dead letter queue', cause);
  }
}

/** Base class for agent / trading algorithm errors. */
export abstract class AgentBaseError extends TradingModelError {
  protected constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Generic error for agent-level failures. */
export class AgentError extends AgentBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
