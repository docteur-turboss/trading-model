import {
	ErrorCode,
	makeErrorCode,
	makeGuard,
} from "@trading-model/common/utils/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";

export const agentError = makeErrorCode(
	ErrorCode.Agent,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isAgentError = makeGuard(ErrorCode.Agent);
