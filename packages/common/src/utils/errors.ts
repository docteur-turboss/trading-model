export { authenticationError, isAuthenticationError } from "./errors/auth";
export {
	type AppError,
	type AppErrorData,
	createAppError,
	ErrorCode,
	errorProp,
	isAppError,
	makeErrorCode,
	makeGuard,
	normalizeError,
} from "./errors/base";
export { configurationError } from "./errors/general";
