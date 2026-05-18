/**
 * Base error class for the Address Manager module.
 *
 * All specific errors of this module should inherit from this class.
 */
export declare abstract class AddressManagerBaseError extends Error {
    /**
     * Optional root cause of the error (for wrapping).
     */
    readonly cause?: unknown;
    /**
     * Creates an instance of AddressManagerBaseError.
     *
     * @param message - Human-readable error message.
     * @param cause - Optional underlying error that triggered this error.
     */
    protected constructor(message: string, cause?: unknown);
}
/**
 * Thrown when a requested service cannot be found
 * in the Address Manager registry.
 *
 * Use this error to handle missing services gracefully.
 */
export declare class ServiceNotFoundError extends AddressManagerBaseError {
    constructor(message: string, cause?: unknown);
}
/**
 * Thrown when a service is found but cannot be reached
 * (e.g., network issue or service down).
 *
 * Useful for retry logic or fallback handling.
 */
export declare class ServiceUnreachableError extends AddressManagerBaseError {
    constructor(message: string, cause?: unknown);
}
/**
 * Thrown when authentication fails
 * (e.g., missing, invalid, or expired token).
 *
 * Catch this error to trigger authentication refresh
 * or deny access as appropriate.
 */
export declare class AuthenticationError extends AddressManagerBaseError {
    constructor(message: string, cause?: unknown);
}
/**
 * Generic error related to interactions with the Address Manager.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
export declare class AddressManagerError extends AddressManagerBaseError {
    constructor(message: string, cause?: unknown);
}
/**
 * Base error class for the Message Manager module.
 *
 * All specific errors of this module should inherit from this class.
 */
export declare abstract class MessageManagerBaseError extends Error {
    /**
     * Optional root cause of the error (for wrapping).
     */
    readonly cause?: unknown;
    /**
     * Creates an instance of AddressManagerBaseError.
     *
     * @param message - Human-readable error message.
     * @param cause - Optional underlying error that triggered this error.
     */
    protected constructor(message: string, cause?: unknown);
}
/**
 * Generic error related to interactions with the Message Manager.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
export declare class MessageManagerError extends MessageManagerBaseError {
    constructor(message: string, cause?: unknown);
}
export declare class MetadataBuilderError extends MessageManagerBaseError {
    constructor(message: string, cause?: unknown);
}
/**
 * Base error class for the Agent module.
 *
 * All specific errors of this module should inherit from this class.
 */
export declare abstract class AgentBaseError extends Error {
    /**
     * Optional root cause of the error (for wrapping).
     */
    readonly cause?: unknown;
    /**
     * Creates an instance of AgentBaseError.
     *
     * @param message - Human-readable error message.
     * @param cause - Optional underlying error that triggered this error.
     */
    protected constructor(message: string, cause?: unknown);
}
/**
 * Generic error related to interactions with Agents.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
export declare class AgentError extends AgentBaseError {
    constructor(message: string, cause?: unknown);
}
