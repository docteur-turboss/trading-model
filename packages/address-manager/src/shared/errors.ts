import {
	ErrorCode,
	makeErrorCode,
	makeGuard,
} from "@trading-model/common/utils/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";

export const addressManagerError = makeErrorCode(
	ErrorCode.AddressManager,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isAddressManagerError = makeGuard(ErrorCode.AddressManager);

export const serviceNotFoundError = makeErrorCode(
	ErrorCode.ServiceNotFound,
	HTTP_STATUS.NOT_FOUND
);

export const serviceUnreachableError = makeErrorCode(
	ErrorCode.ServiceUnreachable,
	HTTP_STATUS.GONE
);
export const isServiceUnreachableError = makeGuard(
	ErrorCode.ServiceUnreachable
);
