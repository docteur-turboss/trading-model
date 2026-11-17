import {
	generateInstanceId,
	generateInstanceToken,
	validInstanceToken,
} from "@trading-model/crypto/token-service";
import type { TokenCryptoPort } from "../../domain/ports/token-crypto.port";

/** TokenCryptoPort backed by the HMAC token service of @trading-model/crypto. */
export const cryptoTokenAdapter: TokenCryptoPort = {
	generateInstanceId,
	generateInstanceToken,
	validInstanceToken,
};
