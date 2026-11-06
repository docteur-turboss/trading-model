import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { ErrorCode, makeErrorCode } from "./base";

export const addressManagerError = makeErrorCode(
	ErrorCode.AddressManager,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);
