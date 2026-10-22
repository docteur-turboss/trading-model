import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const serviceNotFoundError = makeErrorCode(
	ErrorCode.ServiceNotFound,
	HTTP_STATUS.NOT_FOUND
);
export const isServiceNotFoundError = makeGuard(ErrorCode.ServiceNotFound);

export const serviceUnreachableError = makeErrorCode(
	ErrorCode.ServiceUnreachable,
	HTTP_STATUS.GONE
);
export const isServiceUnreachableError = makeGuard(
	ErrorCode.ServiceUnreachable
);
