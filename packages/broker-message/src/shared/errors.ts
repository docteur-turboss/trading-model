import {
	ErrorCode,
	makeErrorCode,
	makeGuard,
} from "@trading-model/common/utils/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";

/** Error code factory for message-manager errors. */
export const messageManagerError = makeErrorCode(
	ErrorCode.MessageManager,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);

/** Error code factory for dead-letter errors. */
export const deadLetterError = makeErrorCode(
	ErrorCode.DeadLetter,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
/** Type guard for dead-letter errors. */
export const isDeadLetterError = makeGuard(ErrorCode.DeadLetter);
