import {
	ErrorCode,
	makeErrorCode,
	makeGuard,
} from "@trading-model/common/utils/errors";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";

/** Error code factory for address-manager errors. */
export const addressManagerError = makeErrorCode(
	ErrorCode.AddressManager,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
/** Type guard for address-manager errors. */
export const isAddressManagerError = makeGuard(ErrorCode.AddressManager);

/** Error code for a service that discovery does not know. */
export const serviceNotFoundError = makeErrorCode(
	ErrorCode.ServiceNotFound,
	HTTP_STATUS.NOT_FOUND
);

/** Error code for a service that cannot be reached. */
export const serviceUnreachableError = makeErrorCode(
	ErrorCode.ServiceUnreachable,
	HTTP_STATUS.GONE
);
/** Type guard for the service-unreachable error. */
export const isServiceUnreachableError = makeGuard(
	ErrorCode.ServiceUnreachable
);
