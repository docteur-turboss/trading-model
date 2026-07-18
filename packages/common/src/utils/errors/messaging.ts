import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const messageManagerError = makeErrorCode(ErrorCode.MessageManager, 503);
export const isMessageManagerError = makeGuard(ErrorCode.MessageManager);

export const nackError = makeErrorCode(ErrorCode.Nack, 500);

export const deadLetterError = makeErrorCode(ErrorCode.DeadLetter, 503);
export const isDeadLetterError = makeGuard(ErrorCode.DeadLetter);

export const backpressureError = makeErrorCode(ErrorCode.Backpressure, 503);
