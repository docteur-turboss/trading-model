import { appendFile } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'node:path';

import { normalizeError } from '../utils/errors';

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
  timestamp: Date; // Timestamp when the log was created
  level: LogLevel; // Severity level of the log
  message: string; // Log message
  context?: Record<string, unknown>; // Optional additional context (e.g., variables, request info)
  userId?: string; // Optional ID of the user related to the log
  sessionId?: string; // Optional session ID
  url?: string; // Optional URL associated with the log
  serviceInCharge?: string; // Optional service or module responsible
}

/** Structured logger with multiple severity levels. */
export class Logger {
  private logLevel: LogLevel; // Minimum log level to record
  private logs: LogEntry[] = []; // Internal buffer of log entries
  private maxLogs: number = 1000; // Maximum buffer size
  private sessionId: string | null; // Session identifier
  private userId: string | null = null; // Optional user identifier
  private handleErrorServiceUrl: string | null = null;
  private readonly env: string | undefined;

  /** @param logLevel - Minimum severity level to log (default: LogLevel.INFO) */
  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
    this.env = process.env.NODE_ENV;
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    const now = new Date();
    return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${this.logLevel}_${(crypto.getRandomValues(new Uint32Array(10))[0] * Math.pow(2, -32)).toString(36).substring(2, 10)}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private safeStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const SENSITIVE_KEY_PATTERNS = [
      /^password$/i,
      /^token$/i,
      /^secret$/i,
      /^authorization$/i,
      /^cookie$/i,
      /^api[-_]?key$/i,
      /^api[-_]?secret$/i,
      /^mysql_root_password$/i,
      /^db_password$/i,
      /^jwt[-_]?secret$/i,
      /^private[-_]?key$/i,
      /^tls[-_]?(key|cert|ca)$/i,
      /^certificatepath$/i,
      /^keycertificatepath$/i,
      /^rootcacertpath$/i,
      /\.secret$/i,
      /\.token$/i,
    ];
    return JSON.stringify(value, (key, val) => {
      if (key && SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) return '[REDACTED]';
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      return val;
    });
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    url: string = '',
    serviceInCharge: string = ''
  ): LogEntry {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const data = {
      timestamp: now,
      level,
      message,
      context,
      sessionId: this.sessionId || undefined,
      userId: this.userId || undefined,
      url,
      serviceInCharge,
    };

    const logDir = process.env.LOG_DIR;
    if (logDir) {
      const logFilePath = path.resolve(logDir);
      const logFileName = `${y}.${m}.${d}-${level}.log`;

      mkdir(logFilePath, { recursive: true }).catch(() => {});
      appendFile(path.resolve(logFilePath, logFileName), this.safeStringify(data) + '\n', err => {
        if (err) console.error('[Logger] Failed to write log file:', err);
      });
    }

    return data;
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
  info(message: string, context?: Record<string, unknown>, url?: string, serviceInCharge?: string) {
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
  warn(message: string, context?: Record<string, unknown>, url?: string, serviceInCharge?: string) {
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

    if (this.env === 'production' || this.env === 'staging') {
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
    this.handleErrorServiceUrl = url;
  }

  private auditResolver:
    (() => Promise<{ url: string; tls: { key: string; cert: string; ca: string } } | null>) | null =
    null;

  setAuditResolver(
    resolver: () => Promise<{ url: string; tls: { key: string; cert: string; ca: string } } | null>
  ): void {
    this.auditResolver = resolver;
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

  /** Sends a log entry to an external error-handling service. */
  private async sendToErrorService(entry: LogEntry): Promise<void> {
    try {
      await fetch(process.env.ERROR_URL_WEBHOOK ?? this.handleErrorServiceUrl ?? '/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.safeStringify(entry),
      });
    } catch (err) {
      const normalized = normalizeError(err);
      console.error('Failed to send log to service:', normalized.message);
    }
  }
}

/** Global logger instance pre-configured based on the current environment. */
export const logger = new Logger(
  process.env.NODE_ENV === 'development'
    ? LogLevel.DEBUG
    : process.env.NODE_ENV === 'staging'
      ? LogLevel.INFO
      : LogLevel.WARN
);

export const _private = Logger;
