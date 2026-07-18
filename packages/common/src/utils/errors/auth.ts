import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const authenticationError = makeErrorCode(ErrorCode.Authentication, 498);
export const isAuthenticationError = makeGuard(ErrorCode.Authentication);
