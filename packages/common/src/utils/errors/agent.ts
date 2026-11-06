import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { ErrorCode, makeErrorCode } from "./base";

export const agentError = makeErrorCode(
	ErrorCode.Agent,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
