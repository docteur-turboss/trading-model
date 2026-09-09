import { HTTP_STATUS } from "../../http-status";
import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const messageManagerError = makeErrorCode(
	ErrorCode.MessageManager,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isMessageManagerError = makeGuard(ErrorCode.MessageManager);

export const nackError = makeErrorCode(
	ErrorCode.Nack,
	HTTP_STATUS.INTERNAL_SERVER_ERROR
);

export const deadLetterError = makeErrorCode(
	ErrorCode.DeadLetter,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isDeadLetterError = makeGuard(ErrorCode.DeadLetter);

export const backpressureError = makeErrorCode(
	ErrorCode.Backpressure,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
