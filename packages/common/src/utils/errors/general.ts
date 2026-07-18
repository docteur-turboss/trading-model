import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const timeoutError = makeErrorCode(ErrorCode.Timeout, 503);
export const isTimeoutError = makeGuard(ErrorCode.Timeout);

export const configurationError = makeErrorCode(ErrorCode.Configuration, 500);
