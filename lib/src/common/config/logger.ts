/**
 * LogLevel enumeration defines the severity levels for logging.
 * DEBUG   - Detailed debugging information
 * INFO    - Informational messages
 * WARN    - Warnings that may need attention
 * ERROR   - Critical errors that require immediate attention
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

/**
 * Represents a single log entry.
 */
export interface LogEntry {
    timestamp: Date;                      // Timestamp when the log was created
    level: LogLevel;                      // Severity level of the log
    message: string;                      // Log message
    context?: Record<string, unknown>;    // Optional additional context (e.g., variables, request info)
    userId?: string;                      // Optional ID of the user related to the log
    sessionId?: string;                   // Optional session ID
    url?: string;                         // Optional URL associated with the log
    serviceInCharge?: string;             // Optional service or module responsible
}

/**
 * Logger class for structured logging with multiple severity levels.
 *
 * Features:
 *  - Supports DEBUG, INFO, WARN, and ERROR log levels.
 *  - Buffers log entries in-memory up to a configurable maximum.
 *  - Associates logs with a unique session ID and optional user ID.
 *  - Optionally sends ERROR-level logs to an external error-handling service
 *    in production or staging environments.
 *  - Provides methods for standardized logging across services, including
 *    context, URL, and service/module metadata.
 *
 * Private Fields:
 *  - logLevel: Minimum log level to record (DEBUG, INFO, WARN, ERROR)
 *  - logs: Internal buffer of recorded log entries
 *  - maxLogs: Maximum number of entries to keep in the buffer
 *  - sessionId: Unique session identifier for this logger instance
 *  - userId: Optional user identifier associated with log entries
 *  - handle_error_service: Optional URL for sending logs to an external service
 */
export class Logger {
    private logLevel: LogLevel;           // Minimum log level to record
    private logs: LogEntry[] = [];        // Internal buffer of log entries
    private maxLogs: number = 1000;       // Maximum buffer size
    private sessionId: string | null;     // Session identifier
    private userId: string | null = null; // Optional user identifier
    private handle_error_service: string | null = null; // Optional external error service URL

    /**
     * Initializes a new Logger instance.
     *
     * The constructor sets the minimum log level that will be recorded and
     * generates a unique session ID for this logger instance.
     *
     * @param logLevel - The minimum severity level to log (default: LogLevel.INFO)
     *                   Only messages with this level or higher will be recorded.
     */
    constructor(logLevel: LogLevel = LogLevel.INFO) {
        this.logLevel = logLevel;
        this.sessionId = this.generateSessionId();
    }

    /**
     * Generates a unique session identifier for the logger instance.
     *
     * The session ID is composed of the current date (year, month, day),
     * the logger's configured log level, and a random alphanumeric string.
     * This ensures that each logger session can be uniquely identified
     * across different runs or requests.
     *
     * @returns A unique string representing the session ID
     */
    private generateSessionId(): string {
        return `${new Date().getFullYear()}.${new Date().getMonth()+1}.${new Date().getDate()}-${this.logLevel}_${Math.random().toString(36).substring(2, 10)}`;
    }

    /**
     * Determines whether a log entry at the specified level should be recorded.
     *
     * This method compares the provided log level against the logger's current
     * configured `logLevel`. Only entries with a severity equal to or higher
     * than the current log level will be recorded.
     *
     * @param level - The severity level of the log to check
     * @returns `true` if the log should be recorded, `false` otherwise
     */
    private shouldLog(level: LogLevel): boolean {
        return level >= this.logLevel;
    }

    /**
     * Constructs a `LogEntry` object from the provided data.
     *
     * This method centralizes the creation of log entries, ensuring a consistent
     * structure including timestamp, log level, message, optional context, and
     * associated metadata such as user ID, session ID, URL, and service information.
     *
     * @param level - The severity level of the log (DEBUG, INFO, WARN, ERROR)
     * @param message - The main log message
     * @param context - Optional additional contextual data to include in the log
     * @param url - Optional URL associated with the log event (default: empty string)
     * @param serviceInCharge - Optional identifier for the service or module responsible (default: empty string)
     * @returns A fully constructed `LogEntry` object ready for logging or buffering
     */
    private createLogEntry(
        level: LogLevel, 
        message: string, 
        context?: Record<string, unknown>, 
        url: string = '', 
        serviceInCharge: string = ''
    ): LogEntry {
        return {
            timestamp: new Date(),
            level,
            message,
            context,
            sessionId: this.sessionId || undefined,
            userId: this.userId || undefined,
            url,
            serviceInCharge
        };
    }

    /**
     * Adds a log entry to the internal log buffer.
     *
     * Behavior:
     *  - Appends the new `LogEntry` to the in-memory `logs` array.
     *  - Ensures the buffer does not exceed `maxLogs` entries by removing
     *    the oldest log if the limit is surpassed (FIFO behavior).
     *
     * This method helps manage memory usage while retaining the most recent logs.
     *
     * @param logEntry - The log entry to add to the buffer
     */
    private addToBuffer(logEntry: LogEntry) {
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
    }

    /**
     * Logs a DEBUG-level message with optional context, URL, and service information.
     *
     * Behavior:
     *  - Checks if DEBUG-level logging is enabled; returns early if not.
     *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
     *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
     *  - Outputs the message to the console via `console.debug`.
     *
     * @param message - The main log message providing detailed debugging information.
     * @param context - Optional additional context (e.g., variables, request data) to include in the log.
     * @param url - Optional URL associated with the log event.
     * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
     */
    debug(
        message: string, 
        context?: Record<string, unknown>, 
        url?: string, 
        serviceInCharge?: string
    ) {
        if (!this.shouldLog(LogLevel.DEBUG)) return;

        const logEntry = this.createLogEntry(LogLevel.DEBUG, message, context, url, serviceInCharge);
        this.addToBuffer(logEntry);
        console.debug(`[DEBUG] [${logEntry.timestamp.toISOString()}] ${message}`, context || '');
    }

    /**
     * Logs an INFO-level message with optional context, URL, and service information.
     *
     * Behavior:
     *  - Checks if INFO-level logging is enabled; returns early if not.
     *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
     *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
     *  - Outputs the message to the console via `console.info`.
     *
     * @param message - The main log message providing informational details.
     * @param context - Optional additional context (e.g., variables, request data) to include in the log.
     * @param url - Optional URL associated with the log event.
     * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
     */
    info(
        message: string, 
        context?: Record<string, unknown>, 
        url?: string, 
        serviceInCharge?: string
    ) {
        if (!this.shouldLog(LogLevel.INFO)) return;

        const logEntry = this.createLogEntry(LogLevel.INFO, message, context, url, serviceInCharge);
        this.addToBuffer(logEntry);
        console.info(`[INFO] [${logEntry.timestamp.toISOString()}] ${message}`, context || '');
    }

    /**
     * Logs a WARN-level message with optional context, URL, and service information.
     *
     * Behavior:
     *  - Checks if WARN-level logging is enabled; returns early if not.
     *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
     *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
     *  - Outputs the message to the console via `console.warn`.
     *
     * @param message - The main log message describing the warning.
     * @param context - Optional additional context (e.g., variables, request data) to include in the log.
     * @param url - Optional URL associated with the log event.
     * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
     */
    warn(
        message: string, 
        context?: Record<string, unknown>, 
        url?: string, 
        serviceInCharge?: string
    ) {
        if (!this.shouldLog(LogLevel.WARN)) return;

        const logEntry = this.createLogEntry(LogLevel.WARN, message, context, url, serviceInCharge);
        this.addToBuffer(logEntry);
        console.warn(`[WARN] [${logEntry.timestamp.toISOString()}] ${message}`, context || '');
    }

    /**
     * Logs an ERROR-level message with optional context, URL, and service information.
     *
     * Behavior:
     *  - Checks if ERROR-level logging is enabled; returns early if not.
     *  - Creates a `LogEntry` containing the message, context, user/session info, URL, and service in charge.
     *  - Adds the entry to the internal log buffer (FIFO, up to `maxLogs`).
     *  - Outputs the message to the console via `console.error`.
     *  - In production or staging environments, forwards the log entry to an external error-handling service
     *    using `sendToErrorService`.
     *
     * @param message - The main log message describing the error.
     * @param context - Optional additional context (e.g., variables, request data) to include in the log.
     * @param url - Optional URL associated with the log event.
     * @param serviceInCharge - Optional identifier for the service or module responsible for the log.
     */
    error(
        message: string, 
        context?: Record<string, unknown>, 
        url?: string, 
        serviceInCharge?: string
    ) {
        if (!this.shouldLog(LogLevel.ERROR)) return;

        const logEntry = this.createLogEntry(LogLevel.ERROR, message, context, url, serviceInCharge);
        this.addToBuffer(logEntry);
        console.error(`[ERROR] [${logEntry.timestamp.toISOString()}] ${message}`, context || '');

        if(process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging") {
            this.sendToErrorService(logEntry);
        }
    }

    /**
     * Assigns a user identifier to be included in all subsequent log entries.
     *
     * This is useful for tracking which user triggered specific actions,
     * providing context in logs for debugging, auditing, or monitoring purposes.
     *
     * @param userId - The identifier of the user associated with future logs
     */
    setUserId(userId: string) {
        this.userId = userId;
    }

    /**
     * Configures the URL of the external error-handling service.
     *
     * This URL will be used by `sendToErrorService` to forward ERROR-level logs
     * when the logger is running in production or staging environments.
     * If not set, `sendToErrorService` will fallback to `process.env.ERROR_URL_WEBHOOK` or `/`.
     *
     * @param url - The endpoint of the external error-handling service
     */
    setErrorHandlerService(url: string) { 
        this.handle_error_service = url;
    }

    /**
     * Retrieves the current in-memory log buffer.
     *
     * This method returns an array of `LogEntry` objects representing
     * all logs recorded so far, up to the configured maximum buffer size.
     *
     * Use this for debugging, testing, or exporting logs, but be aware
     * that it does not persist logs to any external storage or service.
     *
     * @returns An array of `LogEntry` objects currently stored in the logger.
     */
    getLogs() {
        return this.logs;
    }

    /**
     * Sends a log entry to an external error-handling service.
     *
     * This method is typically invoked for ERROR-level logs in production or staging environments.
     * It posts the log entry as JSON to the URL specified by:
     *   1. `process.env.ERROR_URL_WEBHOOK` (highest priority)
     *   2. `this.handle_error_service` (if set via `setErrorHandlerService`)
     *   3. `/` (fallback default)
     *
     * Errors occurring during the HTTP request are caught and logged to the console,
     * ensuring that logging failures do not interrupt application flow.
     *
     * @param entry - The log entry to be sent to the external service
     */
    private async sendToErrorService(entry: LogEntry): Promise<void> {
        try {
            await fetch(process.env.ERROR_URL_WEBHOOK ?? this.handle_error_service ?? "/", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry),
            });
        } catch (err) {
            console.error('Failed to send log to service:', err);
        }
    }
}

/**
 * Global logger instance pre-configured based on the current environment.
 *
 * Logging levels per environment:
 *  - Development: DEBUG (detailed logs for development and debugging)
 *  - Staging: INFO (general informational logs suitable for testing)
 *  - Production: WARN (only warnings and errors to reduce noise)
 *
 * This singleton can be imported and used across the application
 * to ensure consistent logging behavior and log level enforcement.
 */
export const logger = new Logger(
  process.env.NODE_ENV === 'development' 
    ? LogLevel.DEBUG 
    : process.env.NODE_ENV === 'staging' 
      ? LogLevel.INFO 
      : LogLevel.WARN
);

/**
 * Exposes the Logger class for testing or advanced usage.
 */
export const _private = Logger;