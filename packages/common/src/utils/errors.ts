export { authenticationError, isAuthenticationError } from "./errors/auth";
export {
	type AppError,
	type AppErrorData,
	createAppError,
	ErrorCode,
	isAppError,
	makeErrorCode,
	makeGuard,
	normalizeError,
} from "./errors/base";
export {
	configurationError,
	isTimeoutError,
	timeoutError,
} from "./errors/general";
