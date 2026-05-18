"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentError = exports.AgentBaseError = exports.MetadataBuilderError = exports.MessageManagerError = exports.MessageManagerBaseError = exports.AddressManagerError = exports.AuthenticationError = exports.ServiceUnreachableError = exports.ServiceNotFoundError = exports.AddressManagerBaseError = void 0;
/**
 * Base error class for the Address Manager module.
 *
 * All specific errors of this module should inherit from this class.
 */
class AddressManagerBaseError extends Error {
    /**
     * Creates an instance of AddressManagerBaseError.
     *
     * @param message - Human-readable error message.
     * @param cause - Optional underlying error that triggered this error.
     */
    constructor(message, cause) {
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
exports.AddressManagerBaseError = AddressManagerBaseError;
/**
 * Thrown when a requested service cannot be found
 * in the Address Manager registry.
 *
 * Use this error to handle missing services gracefully.
 */
class ServiceNotFoundError extends AddressManagerBaseError {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.ServiceNotFoundError = ServiceNotFoundError;
/**
 * Thrown when a service is found but cannot be reached
 * (e.g., network issue or service down).
 *
 * Useful for retry logic or fallback handling.
 */
class ServiceUnreachableError extends AddressManagerBaseError {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.ServiceUnreachableError = ServiceUnreachableError;
/**
 * Thrown when authentication fails
 * (e.g., missing, invalid, or expired token).
 *
 * Catch this error to trigger authentication refresh
 * or deny access as appropriate.
 */
class AuthenticationError extends AddressManagerBaseError {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * Generic error related to interactions with the Address Manager.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
class AddressManagerError extends AddressManagerBaseError {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.AddressManagerError = AddressManagerError;
/**
 * Base error class for the Message Manager module.
 *
 * All specific errors of this module should inherit from this class.
 */
class MessageManagerBaseError extends Error {
    /**
     * Creates an instance of AddressManagerBaseError.
     *
     * @param message - Human-readable error message.
     * @param cause - Optional underlying error that triggered this error.
     */
    constructor(message, cause) {
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
exports.MessageManagerBaseError = MessageManagerBaseError;
/**
 * Generic error related to interactions with the Message Manager.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
class MessageManagerError extends MessageManagerBaseError {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.MessageManagerError = MessageManagerError;
class MetadataBuilderError extends MessageManagerBaseError {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.MetadataBuilderError = MetadataBuilderError;
/**
 * Base error class for the Agent module.
 *
 * All specific errors of this module should inherit from this class.
 */
class AgentBaseError extends Error {
    /**
     * Creates an instance of AgentBaseError.
     *
     * @param message - Human-readable error message.
     * @param cause - Optional underlying error that triggered this error.
     */
    constructor(message, cause) {
        super(message);
        this.name = new.target.name;
        this.cause = cause;
        /**
         * Necessary to maintain the prototype chain
         * when extending Error in TypeScript.
         */
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AgentBaseError = AgentBaseError;
/**
 * Generic error related to interactions with Agents.
 *
 * Can be used as a fallback for unexpected errors
 * that are not covered by more specific classes.
 */
class AgentError extends AgentBaseError {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.AgentError = AgentError;
