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
