import { HTTP_STATUS } from "../../http-status";
import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const timeoutError = makeErrorCode(
	ErrorCode.Timeout,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isTimeoutError = makeGuard(ErrorCode.Timeout);

export const configurationError = makeErrorCode(
	ErrorCode.Configuration,
	HTTP_STATUS.INTERNAL_SERVER_ERROR
);
