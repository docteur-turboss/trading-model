import {
	ErrorCode,
	makeErrorCode,
	makeGuard,
} from "@trading-model/common/utils/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";

export const messageManagerError = makeErrorCode(
	ErrorCode.MessageManager,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);

export const deadLetterError = makeErrorCode(
	ErrorCode.DeadLetter,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isDeadLetterError = makeGuard(ErrorCode.DeadLetter);
