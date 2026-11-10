export { authenticationError, isAuthenticationError } from "./errors/auth";
export {
	type AppError,
	type AppErrorData,
	createAppError,
	ErrorCode,
	errorProp,
	hasCode,
	isAppError,
	makeErrorCode,
	makeGuard,
	normalizeError,
} from "./errors/base";
export { configurationError, timeoutError } from "./errors/general";
