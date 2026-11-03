import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const agentError = makeErrorCode(
	ErrorCode.Agent,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isAgentError = makeGuard(ErrorCode.Agent);
