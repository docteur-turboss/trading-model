export const ErrorCodes = {
  SERVICE_NOT_FOUND: 'SERVICE_NOT_FOUND',
  SERVICE_UNREACHABLE: 'SERVICE_UNREACHABLE',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  ADDRESS_MANAGER_ERROR: 'ADDRESS_MANAGER_ERROR',
  MESSAGE_MANAGER_ERROR: 'MESSAGE_MANAGER_ERROR',
  METADATA_BUILDER_ERROR: 'METADATA_BUILDER_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NACK_ERROR: 'NACK_ERROR',
  DEAD_LETTER_ERROR: 'DEAD_LETTER_ERROR',
  AGENT_ERROR: 'AGENT_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Single application error class with a discriminant `code` property. */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly cause?: unknown;
  public readonly reason?: string;

  constructor(message: string, code: ErrorCode, options?: { cause?: unknown; reason?: string }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = options?.cause;
    this.reason = options?.reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
