/**
 * Base error class for the Address Manager module.
 *
 * All specific errors of this module should inherit from this class.
 */
export abstract class AddressManagerBaseError extends Error {
  /**
   * Optional root cause of the error (for wrapping).
   */
  public readonly cause?: unknown;

  /**
   * Creates an instance of AddressManagerBaseError.
   *
   * @param message - Human-readable error message.
   * @param cause - Optional underlying error that triggered this error.
   */
  protected constructor(message: string, cause?: unknown) {
    super(message);

    this.name = this.constructor.name;
    this.cause = cause;

    /**
     * Necessary to maintain the prototype chain
     * when extending Error in TypeScript.
     */
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a requested service cannot be found
 * in the Address Manager registry.
 *
 * Use this error to handle missing services gracefully.
 */
export class ServiceNotFoundError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Thrown when a service is found but cannot be reached
 * (e.g., network issue or service down).
 *
 * Useful for retry logic or fallback handling.
 */
export class ServiceUnreachableError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Thrown when authentication fails
 * (e.g., missing, invalid, or expired token).
 *
 * Catch this error to trigger authentication refresh
 * or deny access as appropriate.
 */
export class AuthenticationError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Generic error related to interactions with the Address Manager.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
export class AddressManagerError extends AddressManagerBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Base error class for the Message Manager module.
 *
 * All specific errors of this module should inherit from this class.
 */
export abstract class MessageManagerBaseError extends Error {
  /**
   * Optional root cause of the error (for wrapping).
   */
  public readonly cause?: unknown;

  /**
   * Creates an instance of AddressManagerBaseError.
   *
   * @param message - Human-readable error message.
   * @param cause - Optional underlying error that triggered this error.
   */
  protected constructor(message: string, cause?: unknown) {
    super(message);

    this.name = this.constructor.name;
    this.cause = cause;

    /**
     * Necessary to maintain the prototype chain
     * when extending Error in TypeScript.
     */
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Generic error related to interactions with the Message Manager.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
export class MessageManagerError extends MessageManagerBaseError {
  constructor(message: string, cause?: unknown){
    super(message, cause);
  }
}