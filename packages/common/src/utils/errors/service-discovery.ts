import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const serviceNotFoundError = makeErrorCode(
	ErrorCode.ServiceNotFound,
	404
);
export const isServiceNotFoundError = makeGuard(ErrorCode.ServiceNotFound);

export const serviceUnreachableError = makeErrorCode(
	ErrorCode.ServiceUnreachable,
	410
);
export const isServiceUnreachableError = makeGuard(
	ErrorCode.ServiceUnreachable
);
