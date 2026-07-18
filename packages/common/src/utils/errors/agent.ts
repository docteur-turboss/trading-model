import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const agentError = makeErrorCode(ErrorCode.Agent, 503);
export const isAgentError = makeGuard(ErrorCode.Agent);
