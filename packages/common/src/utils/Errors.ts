export abstract class TradingModelError extends Error {
  public readonly cause?: unknown;

  protected constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export abstract class AddressManagerBaseError extends TradingModelError {
  protected constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class ServiceNotFoundError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class ServiceUnreachableError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class AuthenticationError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class AddressManagerError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export abstract class MessageManagerBaseError extends TradingModelError {
  protected constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class MessageManagerError extends MessageManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class MetadataBuilderError extends MessageManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class TimeoutError extends MessageManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class NackError extends MessageManagerBaseError {
  constructor(public readonly reason?: string, cause?: unknown) {
    super(reason ?? "Message negatively acknowledged", cause);
  }
}

export class DeadLetterError extends MessageManagerBaseError {
  constructor(public readonly reason?: string, cause?: unknown) {
    super(reason ?? "Message sent to dead letter queue", cause);
  }
}

export abstract class AgentBaseError extends TradingModelError {
  protected constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class AgentError extends AgentBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
