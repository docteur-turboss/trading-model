import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { ErrorCode, makeErrorCode } from "./base";

export const timeoutError = makeErrorCode(
	ErrorCode.Timeout,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);

export const configurationError = makeErrorCode(
	ErrorCode.Configuration,
	HTTP_STATUS.INTERNAL_SERVER_ERROR
);
