import { ErrorCode, makeErrorCode, makeGuard } from "./base";

export const addressManagerError = makeErrorCode(ErrorCode.AddressManager, 503);
export const isAddressManagerError = makeGuard(ErrorCode.AddressManager);
