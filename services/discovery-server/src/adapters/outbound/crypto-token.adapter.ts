import {
	generateInstanceId,
	generateInstanceToken,
	validInstanceToken,
	verifyInstanceName,
} from "@trading-model/crypto/application/services/token-service";
import type { TokenCryptoPort } from "../../domain/ports/token-crypto.port";

/** TokenCryptoPort backed by the HMAC token service of @trading-model/crypto. */
export const cryptoTokenAdapter: TokenCryptoPort = {
	generateInstanceId,
	generateInstanceToken,
	validInstanceToken,
	verifyInstanceName: (serviceName) => verifyInstanceName(serviceName as never),
};
