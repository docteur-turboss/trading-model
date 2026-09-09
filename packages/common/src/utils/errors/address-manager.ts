import { HTTP_STATUS } from "../../http-status";
import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const addressManagerError = makeErrorCode(
	ErrorCode.AddressManager,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
export const isAddressManagerError = makeGuard(ErrorCode.AddressManager);
